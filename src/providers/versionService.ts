import type * as vscode from "vscode";
import { PackageCache } from "../core/cache";
import type { PackageVersionInfo } from "../types";
import { Logger } from "../utils/logger";
import { NpmClient } from "./npmClient";

export class VersionService {
	private client: NpmClient;
	private cache: PackageCache;

	constructor(
		cacheTTLMinutes: number = 60,
		registryUrl?: string,
		memento?: vscode.Memento,
	) {
		this.client = new NpmClient(registryUrl);
		this.cache = new PackageCache(cacheTTLMinutes, memento);
	}

	public getCachedPackageInfo(
		packageName: string,
	): PackageVersionInfo | undefined {
		return this.cache.get(packageName);
	}

	public async getPackageInfo(
		packageName: string,
	): Promise<PackageVersionInfo | null> {
		const cached = this.cache.get(packageName);
		if (cached) {
			return cached;
		}

		Logger.log(`Fetching info for ${packageName}`);
		const result = await this.client.fetchPackageInfo(packageName);
		if (result.exists && result.package) {
			this.cache.set(packageName, result.package);
			return result.package;
		}

		if (!result.exists) {
			Logger.error(`Package ${packageName} not found`);
		} else if (result.error) {
			Logger.error(`Error fetching ${packageName}: ${result.error}`);
		}

		return null;
	}

	public updateConfiguration(
		ttlMinutes: number,
		registryUrl?: string,
		memento?: vscode.Memento,
	) {
		this.cache = new PackageCache(ttlMinutes, memento);
		this.client = new NpmClient(registryUrl);
	}
}
