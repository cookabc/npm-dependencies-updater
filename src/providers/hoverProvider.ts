import * as vscode from "vscode";
import { PackageJsonParser } from "../core/packageJsonParser";
import { VersionService } from "./versionService";
import { t } from "../utils/i18n";
import { Logger } from "../utils/logger";

export class NpmHoverProvider implements vscode.HoverProvider {
	private parser: PackageJsonParser;
	private versionService: VersionService;
	private enabled: boolean;

	constructor(versionService: VersionService, enabled: boolean = true) {
		this.parser = new PackageJsonParser();
		this.versionService = versionService;
		this.enabled = enabled;
	}

	public setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	public async provideHover(
		document: vscode.TextDocument,
		position: vscode.Position,
		_token: vscode.CancellationToken,
	): Promise<vscode.Hover | undefined> {
		if (!this.enabled) {
			return undefined;
		}

		const dependencies = this.parser.parse(document.getText());
		const offset = document.offsetAt(position);

		const dep = dependencies.find(
			(d) =>
				(offset >= d.nameRange.start && offset <= d.nameRange.end) ||
				(offset >= d.versionRange.start && offset <= d.versionRange.end),
		);

		if (!dep) {
			return undefined;
		}

		Logger.log(`Providing hover for ${dep.name}`);
		const info = await this.versionService.getPackageInfo(dep.name);
		if (!info) {
			return new vscode.Hover(`${t("checking")} ${dep.name}...`);
		}

		const md = new vscode.MarkdownString();
		md.appendMarkdown(`**${info.name}**\n\n`);
		if (info.summary) {
			md.appendMarkdown(`${info.summary}\n\n`);
		}
		md.appendMarkdown(`${t("latest")}: **${info.latestVersion}**\n`);
		md.appendMarkdown(`Current: **${dep.currentVersion}**\n\n`);

		if (info.homepage) {
			md.appendMarkdown(`[Homepage](${info.homepage})`);
		}

		return new vscode.Hover(md);
	}
}
