/**
 * OSV.dev client for known-vulnerability lookups.
 *
 * Only exact versions are queried — see `vulnerabilityScan.ts` for why a range
 * cannot be checked.
 */

import { Logger } from "../utils/logger";

const OSV_BATCH_URL = "https://api.osv.dev/v1/querybatch";
const TIMEOUT_MS = 10000;
const MAX_BATCH = 1000;

export interface OsvQuery {
	packageName: string;
	version: string;
}

export interface OsvVulnerability {
	id: string;
	summary?: string;
	/** Severity from `database_specific`, e.g. "HIGH". Absent when unknown. */
	severity?: string;
	aliases: string[];
}

/** Stable key for matching a result back to the dependency it came from. */
export function osvKey(packageName: string, version: string): string {
	return `${packageName.toLowerCase()}@${version}`;
}

interface BatchResponse {
	results?: Array<{ vulns?: Array<{ id: string }> } | undefined>;
}

interface VulnerabilityDetail {
	id?: string;
	summary?: string;
	aliases?: string[];
	database_specific?: { severity?: string };
}

/**
 * Vulnerability ids per queried pin. Packages with no known vulnerabilities
 * are absent from the map, so `map.get(key)` being undefined means "clean or
 * unknown" — callers treat both as no warning.
 */
export async function queryVulnerabilities(
	queries: OsvQuery[],
): Promise<Map<string, string[]>> {
	const found = new Map<string, string[]>();
	if (queries.length === 0) {
		return found;
	}

	for (let i = 0; i < queries.length; i += MAX_BATCH) {
		const chunk = queries.slice(i, i + MAX_BATCH);
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

		let data: BatchResponse;
		try {
			const response = await fetch(OSV_BATCH_URL, {
				method: "POST",
				signal: controller.signal,
				headers: {
					"Content-Type": "application/json",
					"User-Agent": "vscode-npm-dependencies-updater",
				},
				body: JSON.stringify({
					queries: chunk.map((query) => ({
						package: { name: query.packageName, ecosystem: "npm" },
						version: query.version,
					})),
				}),
			});
			if (!response.ok) {
				throw new Error(`OSV request failed with status ${response.status}`);
			}
			data = (await response.json()) as BatchResponse;
		} catch (error) {
			// A failed lookup must not read as "no vulnerabilities".
			Logger.error("OSV batch query failed:", error);
			throw error;
		} finally {
			clearTimeout(timeoutId);
		}

		const results = data.results ?? [];
		for (let j = 0; j < chunk.length; j++) {
			const vulns = results[j]?.vulns;
			if (!vulns || vulns.length === 0) {
				continue;
			}
			const ids = vulns.map((vuln) => vuln.id).filter(Boolean);
			if (ids.length > 0) {
				found.set(osvKey(chunk[j].packageName, chunk[j].version), ids);
			}
		}
	}

	return found;
}

/**
 * Details for one advisory. Used when the user opens the vulnerability
 * report, so the extra request only happens on demand.
 */
export async function fetchVulnerabilityDetail(
	id: string,
): Promise<OsvVulnerability | null> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const response = await fetch(
			`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`,
			{
				signal: controller.signal,
				headers: { "User-Agent": "vscode-npm-dependencies-updater" },
			},
		);
		if (!response.ok) {
			return null;
		}
		const vuln = (await response.json()) as VulnerabilityDetail;
		if (!vuln?.id) {
			return null;
		}
		return {
			id: vuln.id,
			summary: vuln.summary,
			severity: vuln.database_specific?.severity,
			aliases: vuln.aliases ?? [],
		};
	} catch (error) {
		Logger.error(`Failed to fetch OSV detail for ${id}:`, error);
		return null;
	} finally {
		clearTimeout(timeoutId);
	}
}
