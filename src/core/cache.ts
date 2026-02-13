import { PackageVersionInfo } from '../types';

interface CacheEntry {
    data: PackageVersionInfo;
    timestamp: number;
}

export class PackageCache {
    private cache: Map<string, CacheEntry> = new Map();
    private ttl: number = 60 * 60 * 1000; // 60 minutes default

    constructor(ttlMinutes: number = 60) {
        this.ttl = ttlMinutes * 60 * 1000;
    }

    public get(packageName: string): PackageVersionInfo | undefined {
        const entry = this.cache.get(packageName);
        if (!entry) {
            return undefined;
        }

        if (Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(packageName);
            return undefined;
        }

        return entry.data;
    }

    public set(packageName: string, data: PackageVersionInfo): void {
        this.cache.set(packageName, {
            data,
            timestamp: Date.now()
        });
    }

    public clear(): void {
        this.cache.clear();
    }
}
