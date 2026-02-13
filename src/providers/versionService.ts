import { NpmClient } from './npmClient';
import { PackageCache } from '../core/cache';
import { PackageVersionInfo } from '../types';

export class VersionService {
    private client: NpmClient;
    private cache: PackageCache;

    constructor(cacheTTLMinutes: number = 60, registryUrl?: string) {
        this.client = new NpmClient(registryUrl);
        this.cache = new PackageCache(cacheTTLMinutes);
    }

    public getCachedPackageInfo(packageName: string): PackageVersionInfo | undefined {
        return this.cache.get(packageName);
    }

    public async getPackageInfo(packageName: string): Promise<PackageVersionInfo | null> {
        const cached = this.cache.get(packageName);
        if (cached) {
            return cached;
        }

        const result = await this.client.fetchPackageInfo(packageName);
        if (result.exists && result.package) {
            this.cache.set(packageName, result.package);
            return result.package;
        }

        return null;
    }

    public updateConfiguration(ttlMinutes: number, registryUrl?: string) {
        this.cache = new PackageCache(ttlMinutes);
        this.client = new NpmClient(registryUrl);
    }
}
