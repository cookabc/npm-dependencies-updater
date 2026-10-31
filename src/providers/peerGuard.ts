import * as path from "node:path";
import type * as vscode from "vscode";
import { peerLockGraph } from "../core/lockfile";
import { PackageJsonParser } from "../core/packageJsonParser";
import { peerConflicts } from "../core/peerCompatibility";
import { pinnedVersion } from "../core/vulnerabilityScan";
import { projectRoot } from "../shared/projectTools";
import { readOptional } from "../shared/validation";
import type { VersionService } from "./versionService";
/** Check both upgraded packages and known reverse peer constraints before inline edits. */
export async function assertPeerCompatibility(
	document: vscode.TextDocument,
	service: VersionService,
	changes: ReadonlyMap<string, string>,
): Promise<void> {
	const deps = new PackageJsonParser()
		.parse(document.getText())
		.filter((d) => !d.isPeer);
	const versions = new Map<string, string>();
	for (const dep of deps) {
		const version = pinnedVersion(dep.currentVersion);
		if (version) versions.set(dep.registryName, version);
	}
	const root = await projectRoot(document, [
		"package-lock.json",
		"npm-shrinkwrap.json",
	]);
	const lock =
		(await readOptional(path.join(root, "npm-shrinkwrap.json"))) ??
		(await readOptional(path.join(root, "package-lock.json")));
	if (lock !== null) {
		const graph = peerLockGraph(lock);
		for (const dep of deps) {
			const nodes = (graph?.packages ?? []).filter(
				(p) => p.direct && p.name === dep.registryName,
			);
			const candidates = new Set(nodes.map((n) => n.version));
			if (candidates.size === 1)
				versions.set(dep.registryName, nodes[0].version);
		}
	}
	for (const [name, version] of changes) versions.set(name, version);
	const manifests = deps.flatMap((dep) => {
		const version = versions.get(dep.registryName);
		if (!version) return [];
		const info = service.getCachedPackageInfo(dep.registryName);
		return [
			{
				name: dep.registryName,
				version,
				peers: info?.versions?.[version]?.peerDependencies,
			},
		];
	});
	const errors = peerConflicts(manifests, versions);
	if (errors.length)
		throw new Error(
			`Peer dependency conflict. Upgrade the related packages together:\n${errors.join("\n")}`,
		);
}
