import * as fs from "node:fs";
import * as path from "node:path";
import * as semver from "semver";
import {
	policyAllows,
	sameMaintenanceLine,
	type UpdatePolicy,
} from "../shared/updatePolicy";
import type { PackageVersionInfo } from "../types";
import { versionRangeOf } from "./dependencySpec";
import { VersionResolver } from "./versionResolver";
/** Target runtime comes from project configuration, never VS Code's Node. */
export function nodeTarget(
	fileName: string,
	configured?: string,
): string | undefined {
	if (configured?.trim()) return configured.trim().replace(/^v/, "");
	let dir = path.dirname(fileName);
	for (;;) {
		for (const name of [".nvmrc", ".node-version"]) {
			try {
				const text = fs
					.readFileSync(path.join(dir, name), "utf8")
					.trim()
					.replace(/^v/, "");
				if (semver.valid(text)) return text;
			} catch {}
		}
		const parent = path.dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
}
/** Re-select from cached metadata so policies never reuse an incompatible answer. */
export function recommend(
	info: PackageVersionInfo,
	current: string,
	policy: UpdatePolicy,
	nodeVersion?: string,
	includePrerelease = false,
): PackageVersionInfo | null {
	if (!info.versions) return info;
	const baseline = semver.minVersion(versionRangeOf(current) ?? current);
	const eligible = Object.keys(info.versions)
		.filter((version) => {
			if (
				!semver.valid(version) ||
				semver.gt(version, info.latestVersion) ||
				(!includePrerelease && semver.prerelease(version))
			)
				return false;
			if (
				!VersionResolver.specIncludes(current, version) &&
				VersionResolver.formatNewVersion(current, version) === null
			)
				return false;
			if (info.versions?.[version]?.deprecated) return false;
			if (
				!policyAllows(info.name, version, info.publishedAt?.[version], policy)
			)
				return false;
			const engine = info.versions?.[version]?.engines?.node;
			if (nodeVersion && engine && !semver.satisfies(nodeVersion, engine))
				return false;
			const parsed = semver.parse(version);
			return (
				!baseline ||
				!parsed ||
				sameMaintenanceLine(
					[baseline.major, baseline.minor],
					[parsed.major, parsed.minor],
					policy.strategy ?? "latest",
				)
			);
		})
		.sort(semver.rcompare);
	const latestVersion = eligible[0];
	return latestVersion ? { ...info, latestVersion } : null;
}
