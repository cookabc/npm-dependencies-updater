export interface DependencyOffsets {
	start: number;
	end: number;
}

export interface ParsedDependency {
	name: string;
	currentVersion: string;
	isDev: boolean;
	// Offsets for the key (name) - useful for CodeLens location
	nameRange: DependencyOffsets;
	// Offsets for the value (version) - useful for replacement
	versionRange: DependencyOffsets;
}

export interface PackageVersionInfo {
	name: string;
	latestVersion: string;
	publishedDate?: string;
	summary?: string;
	homepage?: string;
}

export interface NpmClientResult {
	package: PackageVersionInfo;
	exists: boolean;
	error?: string;
}

export enum UpdateRisk {
	Low = "low", // Patch
	Medium = "medium", // Minor
	High = "high", // Major
}
