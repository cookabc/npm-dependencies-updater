import type * as vscode from "vscode";
import { PackageCache } from "../core/cache";
import type { PackageDetails, PackageVersionInfo } from "../types";
import { Logger } from "../utils/logger";
import { NpmClient } from "./npmClient";

/** How long a failed fetch suppresses new attempts */
const FAILURE_TTL_MS = 5 * 60 * 1000;
/** How long hover enrichment stays cached (success or failure) */
const DETAILS_TTL_MS = 5 * 60 * 1000;

interface FailureEntry {
	message: string;
	timestamp: number;
}

interface DetailsEntry {
	data: PackageDetails | null;
	timestamp: number;
}

export class VersionService {
	private client: NpmClient;
	private cache: PackageCache;
	private showPrerelease: boolean;
	private registryHost: string;
	// Negative cache: packages that recently failed to fetch, so scrolling or
	// hovering over a missing package does not hammer the registry
	private failures: Map<string, FailureEntry> = new Map();
	private details: Map<string, DetailsEntry> = new Map();

	constructor(
		cacheTTLMinutes: number = 60,
		registryUrl?: string,
		memento?: vscode.Memento,
		showPrerelease: boolean = false,
	) {
		this.client = new NpmClient(registryUrl);
		this.cache = new PackageCache(cacheTTLMinutes, memento);
		this.showPrerelease = showPrerelease;
		this.registryHost = VersionService.hostOf(registryUrl);
	}

	private static hostOf(registryUrl?: string): string {
		if (!registryUrl) {
			return "registry.npmjs.org";
		}
		try {
			return new URL(registryUrl).host;
		} catch {
			return registryUrl;
		}
	}

	// Cache keys include the registry host so that switching registries cannot
	// serve data fetched from the previous one
	private key(packageName: string): string {
		return `${this.registryHost}:${packageName}`;
	}

	public getCachedPackageInfo(
		packageName: string,
	): PackageVersionInfo | undefined {
		return this.cache.get(this.key(packageName));
	}

	/** Error message if the package failed to fetch recently, else undefined */
	public getFailure(packageName: string): string | undefined {
		const entry = this.failures.get(packageName);
		if (!entry) {
			return undefined;
		}
		if (Date.now() - entry.timestamp > FAILURE_TTL_MS) {
			this.failures.delete(packageName);
			return undefined;
		}
		return entry.message;
	}

	public clearFailure(packageName: string): void {
		this.failures.delete(packageName);
	}

	public async getPackageInfo(
		packageName: string,
	): Promise<PackageVersionInfo | null> {
		const cached = this.cache.get(this.key(packageName));
		if (cached) {
			this.failures.delete(packageName);
			return cached;
		}

		// A recent failure suppresses new attempts until its TTL runs out
		if (this.getFailure(packageName)) {
			return null;
		}

		Logger.log(`Fetching info for ${packageName}`);
		const result = await this.client.fetchPackageInfo(
			packageName,
			this.showPrerelease,
		);
		if (result.exists && result.package.latestVersion) {
			this.cache.set(this.key(packageName), result.package);
			this.failures.delete(packageName);
			return result.package;
		}

		if (!result.exists) {
			Logger.error(`Package ${packageName} not found`);
		} else if (result.error) {
			Logger.error(`Error fetching ${packageName}: ${result.error}`);
		}
		this.failures.set(packageName, {
			message: result.error ?? "Unknown error",
			timestamp: Date.now(),
		});
		return null;
	}

	/**
	 * Description/homepage for the hover, from the full registry document.
	 * Cached briefly (including misses) so hover is not a request magnet.
	 */
	public async getPackageDetails(
		packageName: string,
	): Promise<PackageDetails | undefined> {
		const key = this.key(packageName);
		const cached = this.details.get(key);
		if (cached && Date.now() - cached.timestamp < DETAILS_TTL_MS) {
			return cached.data ?? undefined;
		}

		const data = await this.client.fetchPackageDetails(packageName);
		this.details.set(key, { data: data ?? null, timestamp: Date.now() });
		return data ?? undefined;
	}

	public updateConfiguration(
		ttlMinutes: number,
		registryUrl?: string,
		memento?: vscode.Memento,
		showPrerelease?: boolean,
	) {
		this.cache = new PackageCache(ttlMinutes, memento);
		this.client = new NpmClient(registryUrl);
		this.registryHost = VersionService.hostOf(registryUrl);
		if (showPrerelease !== undefined) {
			this.showPrerelease = showPrerelease;
		}
	}
}
