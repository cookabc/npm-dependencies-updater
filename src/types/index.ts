export interface DependencyOffsets {
	start: number;
	end: number;
}

export interface ParsedDependency {
	name: string;
	currentVersion: string;
	isDev: boolean;
	// peerDependencies express host compatibility windows; "Update All"
	// deliberately skips them
	isPeer?: boolean;
	// Offsets for the key (name) - useful for CodeLens location
	nameRange: DependencyOffsets;
	// Offsets for the value (version) - useful for replacement
	versionRange: DependencyOffsets;
}

export interface PackageVersionInfo {
	name: string;
	latestVersion: string;
	summary?: string;
	homepage?: string;
}

/**
 * Enrichment data only present in the full registry document (the abbreviated
 * corgi response carries neither description nor homepage)
 */
export interface PackageDetails {
	description?: string;
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
