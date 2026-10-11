import * as semver from "semver";
import type { NpmClientResult, PackageDetails } from "../types";

/**
 * Path segment for a registry request. Scoped names (@scope/pkg) must keep
 * their "@" literal and encode only the slash.
 */
export function registryPath(packageName: string): string {
	return packageName.replace("/", "%2F");
}

/** Pick the newest version, optionally including pre-releases */
export function pickLatest(
	versions: string[],
	includePrerelease: boolean,
): string | null {
	const candidates = includePrerelease
		? versions
		: versions.filter((v) => !semver.prerelease(v));
	if (candidates.length === 0) {
		return null;
	}
	return candidates.sort(semver.rcompare)[0];
}

export class NpmClient {
	private registryUrl: string;
	private activeRequests: number = 0;
	private requestQueue: (() => void)[] = [];
	private readonly MAX_CONCURRENT_REQUESTS = 5;

	constructor(registryUrl: string = "https://registry.npmjs.org") {
		this.registryUrl = registryUrl.replace(/\/$/, "");
	}

	public async fetchPackageInfo(
		packageName: string,
		includePrerelease: boolean = false,
	): Promise<NpmClientResult> {
		await this.enqueue();
		try {
			return await this.doFetch(packageName, includePrerelease);
		} finally {
			this.dequeue();
		}
	}

	private enqueue(): Promise<void> {
		if (this.activeRequests < this.MAX_CONCURRENT_REQUESTS) {
			this.activeRequests++;
			return Promise.resolve();
		}
		return new Promise((resolve) => {
			this.requestQueue.push(resolve);
		});
	}

	private dequeue(): void {
		this.activeRequests--;
		const next = this.requestQueue.shift();
		if (next) {
			this.activeRequests++;
			next();
		}
	}

	/**
	 * Enrichment fetch: description and homepage only exist in the full
	 * document, the abbreviated (corgi) response used by fetchPackageInfo
	 * carries neither. Full packuments can be large, so this is meant for
	 * on-demand use (hover), cached by the caller.
	 */
	public async fetchPackageDetails(
		packageName: string,
	): Promise<PackageDetails | null> {
		const url = `${this.registryUrl}/${registryPath(packageName)}`;
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 10000);
			const response = await fetch(url, {
				signal: controller.signal,
				headers: {
					Accept: "application/json",
					"User-Agent": "vscode-npm-dependencies-updater",
				},
			});
			clearTimeout(timeoutId);

			if (!response.ok) {
				return null;
			}
			const json: any = await response.json();
			return {
				description: json["description"],
				homepage: json["homepage"],
			};
		} catch {
			return null;
		}
	}

	private async doFetch(
		packageName: string,
		includePrerelease: boolean,
	): Promise<NpmClientResult> {
		const url = `${this.registryUrl}/${registryPath(packageName)}`;

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 10000);

			const response = await fetch(url, {
				signal: controller.signal,
				headers: {
					Accept: "application/vnd.npm.install-v1+json",
					"User-Agent": "vscode-npm-dependencies-updater",
				},
			});
			clearTimeout(timeoutId);

			if (response.status === 404) {
				return {
					package: { name: packageName, latestVersion: "" },
					exists: false,
					error: "Package not found",
				};
			}

			if (!response.ok) {
				return {
					package: { name: packageName, latestVersion: "" },
					exists: false,
					error: `Registry returned ${response.status}`,
				};
			}

			const json: any = await response.json();
			const distTagsLatest: string | undefined = json["dist-tags"]?.latest;

			// dist-tags.latest never points at a pre-release; honour the
			// showPrerelease setting by scanning the full version list.
			const latestVersion =
				pickLatest(Object.keys(json["versions"] ?? {}), includePrerelease) ??
				distTagsLatest;

			if (!latestVersion) {
				return {
					package: { name: packageName, latestVersion: "" },
					exists: true,
					error: "No latest version found",
				};
			}

			return {
				package: {
					name: packageName,
					latestVersion,
					summary: json.description,
					homepage: json.homepage,
				},
				exists: true,
			};
		} catch (e: any) {
			return {
				package: { name: packageName, latestVersion: "" },
				exists: false,
				error: e.name === "AbortError" ? "Request timed out" : e.message,
			};
		}
	}
}
