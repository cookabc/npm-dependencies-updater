import * as vscode from 'vscode';
import { PackageVersionInfo } from '../types';

interface CacheEntry {
    data: PackageVersionInfo;
    timestamp: number;
}

export class PackageCache {
    private cache: Map<string, CacheEntry> = new Map();
    private ttl: number = 60 * 60 * 1000; // 60 minutes default
    private memento?: vscode.Memento;
    private readonly STORAGE_KEY = 'npm-deps-updater-cache';

    constructor(ttlMinutes: number = 60, memento?: vscode.Memento) {
        this.ttl = ttlMinutes * 60 * 1000;
        this.memento = memento;
        this.loadFromStorage();
    }

    private loadFromStorage(): void {
        if (!this.memento) return;
        
        const stored = this.memento.get<Record<string, CacheEntry>>(this.STORAGE_KEY);
        if (stored) {
            // Restore from storage, filter out expired entries
            const now = Date.now();
            for (const [key, entry] of Object.entries(stored)) {
                if (now - entry.timestamp < this.ttl) {
                    this.cache.set(key, entry);
                }
            }
        }
    }

    private saveToStorage(): void {
        if (!this.memento) return;
        
        const storageObj: Record<string, CacheEntry> = {};
        this.cache.forEach((value, key) => {
            storageObj[key] = value;
        });
        this.memento.update(this.STORAGE_KEY, storageObj);
    }

    public get(packageName: string): PackageVersionInfo | undefined {
        const entry = this.cache.get(packageName);
        if (!entry) {
            return undefined;
        }

        if (Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(packageName);
            this.saveToStorage();
            return undefined;
        }

        return entry.data;
    }

    public set(packageName: string, data: PackageVersionInfo): void {
        this.cache.set(packageName, {
            data,
            timestamp: Date.now()
        });
        this.saveToStorage();
    }

    public clear(): void {
        this.cache.clear();
        if (this.memento) {
            this.memento.update(this.STORAGE_KEY, undefined);
        }
    }
}
