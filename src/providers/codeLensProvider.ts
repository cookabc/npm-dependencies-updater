import * as vscode from "vscode";
import { updateLensLabel } from "../core/lensLabel";
import { PackageJsonParser } from "../core/packageJsonParser";
import { VersionResolver } from "../core/versionResolver";
import {
	collectVulnerabilityTargets,
	pinnedVersion,
} from "../core/vulnerabilityScan";
import { type ParsedDependency, UpdateRisk } from "../types";
import { t } from "../utils/i18n";
import { Logger } from "../utils/logger";
import type { StatusBarManager } from "../utils/statusBar";
import { osvKey, queryVulnerabilities } from "./osvClient";
import type { VersionService } from "./versionService";

/**
 * Custom CodeLens that stores dependency and document info for resolution
 */
class DependencyCodeLens extends vscode.CodeLens {
	constructor(
		range: vscode.Range,
		public readonly dependency: ParsedDependency,
		public readonly documentUri: vscode.Uri,
	) {
		super(range);
	}
}

export class NpmCodeLensProvider implements vscode.CodeLensProvider {
	private _onDidChangeCodeLenses: vscode.EventEmitter<void> =
		new vscode.EventEmitter<void>();
	public readonly onDidChangeCodeLenses: vscode.Event<void> =
		this._onDidChangeCodeLenses.event;

	private parser: PackageJsonParser;
	private versionService: VersionService;
	private statusBar: StatusBarManager;
	private pendingFetches: Set<string> = new Set();
	private enabled: boolean;
	// Vulnerability ids per pinned dependency: "package@version" -> ids
	private vulnerabilityCache: Map<string, string[]> = new Map();
	// Pins already sent to OSV, so a failed lookup is not retried on every paint
	private scannedPins: Set<string> = new Set();
	private checkVulnerabilities: boolean;

	constructor(
		versionService: VersionService,
		statusBar: StatusBarManager,
		enabled: boolean = true,
		checkVulnerabilities: boolean = true,
	) {
		this.parser = new PackageJsonParser();
		this.versionService = versionService;
		this.statusBar = statusBar;
		this.enabled = enabled;
		this.checkVulnerabilities = checkVulnerabilities;
	}

	public setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	/** Turning the check off also drops what it found, so no stale shields stay. */
	public setCheckVulnerabilities(enabled: boolean): void {
		this.checkVulnerabilities = enabled;
		if (!enabled) {
			this.vulnerabilityCache.clear();
			this.scannedPins.clear();
		}
	}

	public refresh(): void {
		this._onDidChangeCodeLenses.fire();
	}

	public async provideCodeLenses(
		document: vscode.TextDocument,
		_token: vscode.CancellationToken,
	): Promise<vscode.CodeLens[]> {
		if (!this.enabled) {
			return [];
		}

		const lenses: vscode.CodeLens[] = [];
		let dependencies: ParsedDependency[];
		try {
			dependencies = this.parser.parse(document.getText());
		} catch (e) {
			Logger.error("Failed to parse package.json", e);
			return [];
		}

		let totalUpdates = 0;
		let hasRiskyUpdates = false;
		let allChecked = true;

		for (const dep of dependencies) {
			const startPos = document.positionAt(dep.nameRange.start);
			const endPos = document.positionAt(dep.nameRange.end);
			const range = new vscode.Range(startPos, endPos);

			const info = this.versionService.getCachedPackageInfo(dep.registryName);
			if (info) {
				const isUpdateAvailable = VersionResolver.isUpdateAvailable(
					dep.currentVersion,
					info.latestVersion,
				);
				if (isUpdateAvailable) {
					totalUpdates++;
					const risk = VersionResolver.calculateUpdateRisk(
						dep.currentVersion,
						info.latestVersion,
					);
					if (risk === UpdateRisk.High) {
						hasRiskyUpdates = true;
					}
				}
			} else {
				allChecked = false;
			}

			// Create a typed CodeLens with the dependency data
			lenses.push(new DependencyCodeLens(range, dep, document.uri));

			// Only an exact version names what OSV should be asked about.
			const pinned = this.checkVulnerabilities
				? pinnedVersion(dep.currentVersion)
				: null;
			if (pinned) {
				const ids = this.vulnerabilityCache.get(
					osvKey(dep.registryName, pinned),
				);
				if (ids && ids.length > 0) {
					lenses.push(
						new vscode.CodeLens(range, {
							title: `$(shield) ${t("vulnerable", ids.length)}`,
							tooltip: t("vulnerableTooltip", dep.registryName, pinned),
							command: "npmDeps.showVulnerabilities",
							arguments: [dep.registryName, pinned, ids],
						}),
					);
				}
			}

			// Also add the npm link CodeLens immediately as it doesn't need resolution
			lenses.push(
				new vscode.CodeLens(range, {
					title: "$(link-external) npm",
					tooltip: t("npmDeps"),
					command: "npmDeps.openOnNpm",
					arguments: [
						dep.registryName,
						this.versionService.registryFor(dep.registryName),
					],
				}),
			);
		}

		if (this.checkVulnerabilities) {
			this.scanVulnerabilitiesAsync(dependencies);
		}

		if (!allChecked) {
			this.statusBar.showChecking();
		} else {
			this.statusBar.update(
				totalUpdates,
				hasRiskyUpdates,
				this.countVulnerable(dependencies),
			);
		}
		if (dependencies.length > 0) {
			this.statusBar.showNow();
		}

		return lenses;
	}

	/** Pinned dependencies in this document with at least one advisory. */
	private countVulnerable(dependencies: ParsedDependency[]): number {
		let count = 0;
		for (const dep of dependencies) {
			const pinned = pinnedVersion(dep.currentVersion);
			if (!pinned) {
				continue;
			}
			const ids = this.vulnerabilityCache.get(osvKey(dep.registryName, pinned));
			if (ids && ids.length > 0) {
				count++;
			}
		}
		return count;
	}

	/**
	 * Query OSV for every exact pin in the document, once per pin.
	 *
	 * One batched request covers all of them. A pin that was already sent is
	 * not sent again, so a failed lookup does not repeat on every repaint.
	 */
	private async scanVulnerabilitiesAsync(
		dependencies: ParsedDependency[],
	): Promise<void> {
		const pending = collectVulnerabilityTargets(dependencies).filter(
			(target) => !this.scannedPins.has(target.key),
		);
		if (pending.length === 0) {
			return;
		}
		for (const target of pending) {
			this.scannedPins.add(target.key);
		}

		try {
			const found = await queryVulnerabilities(
				pending.map((target) => ({
					packageName: target.packageName,
					version: target.version,
				})),
			);
			let changed = false;
			for (const [key, ids] of found) {
				if (!this.vulnerabilityCache.has(key)) {
					changed = true;
				}
				this.vulnerabilityCache.set(key, ids);
			}
			if (changed) {
				this._onDidChangeCodeLenses.fire();
			}
		} catch (error) {
			// The pins stay recorded, so this is reported once rather than
			// retried on every repaint.
			Logger.error("Vulnerability scan failed:", error);
		}
	}

	public async resolveCodeLens(
		codeLens: vscode.CodeLens,
		_token: vscode.CancellationToken,
	): Promise<vscode.CodeLens> {
		if (!(codeLens instanceof DependencyCodeLens)) {
			return codeLens;
		}

		const dep = codeLens.dependency;
		const uri = codeLens.documentUri;

		const info = this.versionService.getCachedPackageInfo(dep.registryName);

		if (!info && this.versionService.getFailure(dep.registryName)) {
			// A recent fetch failed; show it and let the user retry instead of
			// spinning (and re-requesting) on every resolve
			codeLens.command = {
				title: `$(error) ${t("checkFailed")}`,
				tooltip: `${this.versionService.getFailure(dep.registryName)} — ${t("retryCheck")}`,
				command: "npmDeps.retryFetch",
				arguments: [dep.registryName],
			};
			return codeLens;
		}

		if (info) {
			const isUpdateAvailable = VersionResolver.isUpdateAvailable(
				dep.currentVersion,
				info.latestVersion,
			);

			if (isUpdateAvailable) {
				const versionRange = this.getVersionRange(uri, dep);
				if (!versionRange) {
					return codeLens;
				}

				const risk = VersionResolver.calculateUpdateRisk(
					dep.currentVersion,
					info.latestVersion,
				);
				const { title, tooltip } = updateLensLabel(risk, info.latestVersion, {
					updateTo: t("updateTo"),
					majorUpdate: t("majorUpdate"),
					minorUpdate: t("minorUpdate"),
					patchUpdate: t("patchUpdate"),
				});

				codeLens.command = {
					title: title,
					tooltip: tooltip,
					command: "npmDeps.updateVersion",
					arguments: [
						uri,
						versionRange,
						dep.name,
						dep.currentVersion,
						info.latestVersion,
						dep.section,
					],
				};
			} else if (
				!VersionResolver.specIncludes(dep.currentVersion, info.latestVersion)
			) {
				// Latest sits outside a range we cannot safely rewrite. Show it,
				// but do not offer a one-click upgrade that would write a broken spec.
				codeLens.command = {
					title: `$(info) ${t("latest")} ${info.latestVersion}`,
					tooltip: `${t("latest")}: ${info.latestVersion}`,
					command: "npmDeps.openOnNpm",
					arguments: [
						dep.registryName,
						this.versionService.registryFor(dep.registryName),
					],
				};
			} else {
				codeLens.command = {
					title: `$(check-all) ${t("upToDate")}`,
					tooltip: `${t("upToDate")}: ${info.latestVersion}`,
					command: "npmDeps.showUpToDate",
					arguments: [dep.name, info.latestVersion],
				};
			}
		} else {
			codeLens.command = {
				title: `$(sync~spin) ${t("checking")}...`,
				command: "",
				tooltip: t("scanning"),
			};

			if (!this.pendingFetches.has(dep.registryName)) {
				this.fetchVersionInBackground(dep.registryName);
			}
		}

		return codeLens;
	}

	private getVersionRange(
		uri: vscode.Uri,
		dep: ParsedDependency,
	): vscode.Range | undefined {
		const document = vscode.workspace.textDocuments.find(
			(d) => d.uri.toString() === uri.toString(),
		);
		if (!document) {
			Logger.error(`Document not found for URI: ${uri.toString()}`);
			return undefined;
		}
		const versionStartPos = document.positionAt(dep.versionRange.start);
		const versionEndPos = document.positionAt(dep.versionRange.end);
		return new vscode.Range(versionStartPos, versionEndPos);
	}

	private async fetchVersionInBackground(packageName: string) {
		this.pendingFetches.add(packageName);
		try {
			await this.versionService.getPackageInfo(packageName);
			this._onDidChangeCodeLenses.fire();
		} catch (e) {
			Logger.error(`Failed to fetch version for ${packageName}`, e);
		} finally {
			this.pendingFetches.delete(packageName);
		}
	}
}
