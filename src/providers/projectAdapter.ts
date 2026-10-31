import * as path from "node:path";
import * as vscode from "vscode";
import { parsePackageLock } from "../core/lockfile";
import { PackageJsonParser } from "../core/packageJsonParser";
import { nodeTarget } from "../core/recommendation";
import { VersionResolver } from "../core/versionResolver";
import type { Command } from "../shared/processRunner";
import type { ProjectAdapter } from "../shared/projectTools";
import { readOptional } from "../shared/validation";
import { osvKey, queryVulnerabilities } from "./osvClient";
import { assertPeerCompatibility } from "./peerGuard";
import { checkedUpgradeTargets } from "./upgradeGuard";
import type { VersionService } from "./versionService";
/** Use the project's package manager; never rewrite a lockfile by hand. */
export function npmProjectAdapter(service: VersionService): ProjectAdapter {
	const parser = new PackageJsonParser();
	return {
		namespace: "npmDeps",
		supports: (name) => path.basename(name) === "package.json",
		lockfiles: [
			"package-lock.json",
			"npm-shrinkwrap.json",
			"pnpm-lock.yaml",
			"yarn.lock",
			"bun.lock",
			"bun.lockb",
		],
		advisories: queryVulnerabilities,
		async report(document, root) {
			const lock =
				(await readOptional(path.join(root, "npm-shrinkwrap.json"))) ??
				(await readOptional(path.join(root, "package-lock.json")));
			if (lock === null)
				throw new Error(
					"Dependency reports currently require package-lock.json or npm-shrinkwrap.json (format 2 or 3). Other package managers can still validate updates.",
				);
			const graph = parsePackageLock(lock);
			graph.declarations = parser.parse(document.getText()).map((dep) => ({
				name: dep.name,
				specifier: dep.currentVersion,
				resolvedName: dep.registryName,
			}));
			return graph;
		},
		async propose(document) {
			const text = document.getText();
			const dependencies = parser.parse(text).filter((d) => !d.isPeer);
			const config = vscode.workspace.getConfiguration("npmDeps", document.uri);
			const node = nodeTarget(
				document.fileName,
				config.get<string>("targetNodeVersion", ""),
			);
			const updates = [];
			for (const dep of dependencies) {
				const info = await service.getPackageInfo(
					dep.registryName,
					dep.currentVersion,
					node,
				);
				if (!info && service.getFailure(dep.registryName))
					throw new Error(
						`${dep.name}: version lookup failed. Retry before validating updates.`,
					);
				const replacement =
					info &&
					VersionResolver.formatNewVersion(
						dep.currentVersion,
						info.latestVersion,
					);
				if (info && replacement)
					updates.push({ dep, version: info.latestVersion, replacement });
			}
			const accepted = await checkedUpgradeTargets(
				updates.map((u) => ({
					packageName: u.dep.registryName,
					version: u.version,
				})),
				config.get<boolean>("checkVulnerabilities", true),
			);
			await assertPeerCompatibility(
				document,
				service,
				new Map(
					updates
						.filter((u) => accepted.has(osvKey(u.dep.registryName, u.version)))
						.map((u) => [u.dep.registryName, u.version]),
				),
			);
			let proposed = text;
			for (const update of updates
				.filter((u) => accepted.has(osvKey(u.dep.registryName, u.version)))
				.sort((a, b) => b.dep.versionRange.start - a.dep.versionRange.start))
				proposed =
					proposed.slice(0, update.dep.versionRange.start) +
					JSON.stringify(update.replacement) +
					proposed.slice(update.dep.versionRange.end);
			return proposed;
		},
		async plan(root, manifest) {
			if (path.dirname(manifest) !== ".") {
				const text =
					(await readOptional(path.join(root, "npm-shrinkwrap.json"))) ??
					(await readOptional(path.join(root, "package-lock.json")));
				const packages = text
					? (JSON.parse(text) as { packages?: Record<string, unknown> })
							.packages
					: undefined;
				if (!packages?.[path.dirname(manifest).split(path.sep).join("/")])
					throw new Error(
						"Nested validation currently requires a declared npm workspace recorded in package-lock.json. Run the command from the project root or use the project's package-manager workflow.",
					);
			}
			const config = vscode.workspace.getConfiguration("npmDeps");
			const pkg = JSON.parse(
				(await readOptional(path.join(root, "package.json"))) ?? "{}",
			) as { packageManager?: string; scripts?: Record<string, string> };
			let manager = pkg.packageManager?.split("@")[0];
			if (!manager) {
				const detected = [];
				for (const [file, name] of [
					["package-lock.json", "npm"],
					["npm-shrinkwrap.json", "npm"],
					["pnpm-lock.yaml", "pnpm"],
					["yarn.lock", "yarn"],
					["bun.lock", "bun"],
					["bun.lockb", "bun"],
				])
					if ((await readOptional(path.join(root, file))) !== null)
						detected.push(name);
				const names = [...new Set(detected)];
				if (names.length > 1)
					throw new Error(
						"Multiple package managers were detected. Set packageManager in the root package.json before validating.",
					);
				manager = names[0] ?? "npm";
			}
			if (
				manager === "bun" &&
				(await readOptional(path.join(root, "bun.lockb"))) !== null
			)
				throw new Error(
					"Convert bun.lockb to the text bun.lock format before using isolated validation.",
				);
			if (!["npm", "pnpm", "yarn", "bun"].includes(manager))
				throw new Error(`Unsupported package manager: ${manager}`);
			const allowScripts = config.get<boolean>("allowInstallScripts", false);
			const args = ["install", ...(allowScripts ? [] : ["--ignore-scripts"])];
			if (manager === "npm") args.push("--no-audit", "--no-fund");
			if (manager === "pnpm") args.push("--no-frozen-lockfile");
			// Yarn Berry controls lifecycle scripts through its environment/config, not --ignore-scripts.
			if (
				manager === "yarn" &&
				pkg.packageManager &&
				!pkg.packageManager.startsWith("yarn@1.")
			)
				throw new Error(
					"Yarn Berry validation needs project-specific install settings. Use inline updates and the project's Yarn workflow for now.",
				);
			const configured = config.get<Command[]>("validationCommands", []);
			const tests = configured.length
				? configured
				: ["test", "typecheck", "build"]
						.filter((name) => pkg.scripts?.[name])
						.map((name) => ({ executable: manager, args: ["run", name] }));
			return { commands: [{ executable: manager, args }], testCommands: tests };
		},
	};
}
