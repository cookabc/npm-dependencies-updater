import * as assert from "node:assert";
import { parsePackageLock, peerLockGraph } from "../../core/lockfile";
import { peerConflicts } from "../../core/peerCompatibility";
import { recommend } from "../../core/recommendation";
import { VersionResolver } from "../../core/versionResolver";
import { dependencyPaths } from "../../shared/dependencyGraph";
import { UpdateRisk } from "../../types";

const raw = {
	name: "pkg",
	latestVersion: "2.0.0",
	versions: {
		"1.0.0": {},
		"1.1.0": { engines: { node: ">=18" } },
		"1.2.0-rc.1": { engines: { node: ">=18" } },
		"2.0.0": { engines: { node: ">=22" } },
	},
};
describe("npm project-aware recommendations", () => {
	it("chooses a release compatible with the target Node runtime", () =>
		assert.strictEqual(
			recommend(raw, "1.0.0", {}, "20.10.0")?.latestVersion,
			"1.1.0",
		));
	it("never silently enables prereleases while filtering engine constraints", () =>
		assert.strictEqual(
			recommend(raw, "1.0.0", {}, "20.10.0", true)?.latestVersion,
			"1.2.0-rc.1",
		));
	it("finds a compatible candidate inside compound range bounds", () =>
		assert.strictEqual(
			recommend(raw, ">=1.0.0 <2.0.0", {})?.latestVersion,
			"1.1.0",
		));
	it("returns no candidate when all versions are deferred", () =>
		assert.strictEqual(
			recommend(raw, "1.0.0", {
				deferredPackages: { pkg: "2999-01-01T00:00:00Z" },
			}),
			null,
		));
	it("keeps patch updates in the same major/minor line", () =>
		assert.strictEqual(
			recommend(raw, "1.0.0", { strategy: "patch" })?.latestVersion,
			"1.0.0",
		));
	it("requires review for initial-development minor changes", () =>
		assert.strictEqual(
			VersionResolver.calculateUpdateRisk("^0.3.0", "0.4.0"),
			UpdateRisk.High,
		));
});
describe("npm resolved dependency graph", () => {
	const entries = {
		"": { dependencies: { a: "^1", b: "^1" } },
		"node_modules/a": { version: "1.0.0", dependencies: { shared: "^1" } },
		"node_modules/b": { version: "1.0.0", dependencies: { shared: "^2" } },
		"node_modules/shared": { version: "1.2.0" },
		"node_modules/b/node_modules/shared": { version: "2.1.0" },
	};
	it("resolves nested versions separately and records their introducing path", () => {
		const graph = parsePackageLock(
			JSON.stringify({ lockfileVersion: 3, packages: entries }),
		);
		assert.deepStrictEqual(
			dependencyPaths(graph).get("node_modules/b/node_modules/shared"),
			["b@1.0.0", "shared@2.1.0"],
		);
		assert.deepStrictEqual(dependencyPaths(graph).get("node_modules/shared"), [
			"a@1.0.0",
			"shared@1.2.0",
		]);
	});
	it("resolves workspace symlinks and their dependencies", () => {
		const graph = parsePackageLock(
			JSON.stringify({
				lockfileVersion: 2,
				packages: {
					"": { dependencies: { app: "*" } },
					"node_modules/app": { link: true, resolved: "packages/app" },
					"packages/app": {
						name: "app",
						version: "1.0.0",
						dependencies: { leaf: "*" },
					},
					"node_modules/leaf": { version: "1.0.0" },
				},
			}),
		);
		assert.strictEqual(
			graph.packages.find((p) => p.name === "app")?.direct,
			true,
		);
		assert.deepStrictEqual(dependencyPaths(graph).get("node_modules/leaf"), [
			"leaf@1.0.0",
		]);
	});
	it("rejects unsupported lock versions instead of implying no vulnerabilities", () =>
		assert.throws(
			() => parsePackageLock('{"lockfileVersion":1}'),
			/format 2 or 3/,
		));
});
describe("Coordinated peer updates", () => {
	const packages = [
		{ name: "react-dom", version: "19.0.0", peers: { react: "^19.0.0" } },
	];
	it("finds proven peer conflicts", () =>
		assert.strictEqual(
			peerConflicts(packages, new Map([["react", "18.3.0"]])).length,
			1,
		));
	it("accepts a coordinated proposal that updates both packages", () =>
		assert.deepStrictEqual(
			peerConflicts(packages, new Map([["react", "19.0.0"]])),
			[],
		));
	it("leaves unknown peer versions to the package manager instead of inventing a range floor", () =>
		assert.deepStrictEqual(peerConflicts(packages, new Map()), []));
});

describe("Legacy lockfile inline compatibility", () => {
	it("leaves v1 peer resolution unknown instead of disabling inline updates", () =>
		assert.strictEqual(
			peerLockGraph('{"lockfileVersion":1,"dependencies":{}}'),
			null,
		));
	it("surfaces corrupt JSON instead of ignoring it", () =>
		assert.throws(() => peerLockGraph("{broken"), SyntaxError));
});
