import * as semver from "semver";
/** Report only proven conflicts. The package manager resolves unknown/optional peers. */
export function peerConflicts(
	packages: { name: string; version: string; peers?: Record<string, string> }[],
	versions: ReadonlyMap<string, string>,
): string[] {
	const errors: string[] = [];
	for (const pkg of packages)
		for (const [name, range] of Object.entries(pkg.peers ?? {})) {
			const version = versions.get(name);
			if (
				version &&
				semver.valid(version) &&
				semver.validRange(range) &&
				!semver.satisfies(version, range, { includePrerelease: true })
			)
				errors.push(
					`${pkg.name}@${pkg.version} requires ${name} ${range}; the proposal resolves ${version}`,
				);
		}
	return errors;
}
