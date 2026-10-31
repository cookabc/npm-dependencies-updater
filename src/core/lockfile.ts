/** package-lock v2/v3 graph, resolving nested installs and workspace links. */
import * as path from "node:path";
import type { DependencyGraph, LockedPackage } from "../shared/dependencyGraph";

interface Entry {
	name?: string;
	version?: string;
	resolved?: string;
	link?: boolean;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
}
/** Keep separate nodes for separate installed locations, even at the same version. */
export function parsePackageLock(text: string): DependencyGraph {
	const data = JSON.parse(text) as {
		lockfileVersion?: number;
		packages?: Record<string, Entry>;
	};
	if (
		![2, 3].includes(data.lockfileVersion ?? 0) ||
		!data.packages ||
		typeof data.packages !== "object"
	)
		throw new Error(
			"Expected a package-lock.json in lockfile format 2 or 3. Regenerate older locks with your package manager first.",
		);
	const entries = data.packages;
	const nodes: LockedPackage[] = [];
	const byId = new Map<string, LockedPackage>();
	for (const [id, entry] of Object.entries(entries)) {
		if (!id || entry.link || !entry.version) continue;
		const tail = id.split("node_modules/").slice(-1)[0] ?? id;
		const node = {
			id,
			name: entry.name ?? tail,
			version: entry.version,
			dependencies: [] as string[],
			direct: false,
			registry: entry.resolved,
		};
		nodes.push(node);
		byId.set(id, node);
	}
	const resolve = (from: string, name: string): string | undefined => {
		let dir = from;
		for (;;) {
			const id = path.posix.join(dir, "node_modules", name);
			const entry = entries[id];
			if (entry) return entry.link ? entry.resolved?.replace(/^\.\//, "") : id;
			if (!dir || dir === ".") return undefined;
			const parent = path.posix.dirname(dir);
			if (parent === dir) return undefined;
			dir = parent === "." ? "" : parent;
		}
	};
	for (const [id, entry] of Object.entries(entries)) {
		const parent = byId.get(id);
		// Root/workspace dev dependencies are roots; package dev dependencies are not installed edges.
		const workspace = !id.includes("node_modules/");
		const names = new Set(
			Object.keys({
				...entry.dependencies,
				...entry.optionalDependencies,
				...(workspace ? entry.devDependencies : {}),
			}),
		);
		for (const name of names) {
			const target = resolve(id, name);
			if (!target) continue;
			if (workspace) {
				const node = byId.get(target);
				if (node) node.direct = true;
			}
			if (parent && !parent.dependencies.includes(target))
				parent.dependencies.push(target);
		}
	}
	return {
		format: `package-lock v${data.lockfileVersion}`,
		packages: nodes,
		warnings: [
			"Resolved versions are from the lockfile; the installed environment may differ.",
		],
	};
}

/** Unsupported lock versions leave peer resolution unknown; they must not disable inline updates. */
export function peerLockGraph(text: string): DependencyGraph | null {
	const data = JSON.parse(text) as { lockfileVersion?: number };
	return data.lockfileVersion === 2 || data.lockfileVersion === 3
		? parsePackageLock(text)
		: null;
}
