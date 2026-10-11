import * as semver from "semver";
import { UpdateRisk } from "../types";

export class VersionResolver {
	public static isUpdateAvailable(
		currentVersion: string,
		latestVersion: string,
	): boolean {
		try {
			// Clean versions
			const current = semver.coerce(currentVersion);
			const latest = semver.coerce(latestVersion);

			if (!current || !latest) {
				return false;
			}

			return semver.gt(latest, current);
		} catch (e) {
			return false;
		}
	}

	public static calculateUpdateRisk(
		currentVersion: string,
		latestVersion: string,
	): UpdateRisk {
		try {
			const current = semver.coerce(currentVersion);
			const latest = semver.coerce(latestVersion);

			if (!current || !latest) {
				return UpdateRisk.Low;
			}

			const diff = semver.diff(current, latest);

			if (diff === "major" || diff === "premajor") {
				return UpdateRisk.High;
			}
			if (diff === "minor" || diff === "preminor") {
				return UpdateRisk.Medium;
			}
			return UpdateRisk.Low;
		} catch (e) {
			return UpdateRisk.Low;
		}
	}

	public static getDiffType(
		currentVersion: string,
		latestVersion: string,
	): semver.ReleaseType | null {
		try {
			const current = semver.coerce(currentVersion);
			const latest = semver.coerce(latestVersion);

			if (!current || !latest) {
				return null;
			}

			return semver.diff(current, latest);
		} catch (e) {
			return null;
		}
	}

	public static formatNewVersion(
		currentVersionStr: string,
		newVersionStr: string,
	): string {
		const range = currentVersionStr.trim();

		// OR alternatives ("^1.0.0 || ^2.0.0"): bump the first alternative,
		// leave the rest untouched
		if (range.includes("||")) {
			const [first, ...rest] = range.split("||");
			return [
				VersionResolver.bumpSimpleRange(first.trim(), newVersionStr),
				...rest.map((s) => s.trim()),
			].join(" || ");
		}

		return VersionResolver.bumpSimpleRange(range, newVersionStr);
	}

	/**
	 * Bump the lower-bound part of a simple (AND-only) range, keeping any
	 * upper bounds: ">=1.2 <2.0" + 1.4.0 -> ">=1.4.0 <2.0"
	 */
	private static bumpSimpleRange(range: string, newVersionStr: string): string {
		const parts = range.split(/[\s,]+/).filter(Boolean);

		if (parts.length <= 1) {
			const prefixMatch = range.match(/^([^\d]*)/);
			const prefix = prefixMatch ? prefixMatch[1] : "";
			return `${prefix}${newVersionStr}`;
		}

		let replaced = false;
		const bumped = parts.map((part) => {
			if (replaced) {
				return part;
			}
			// A lower bound is a bare version or prefixed with > >= ^ ~ =;
			// upper bounds start with < and must be kept
			if (!part.startsWith("<")) {
				const prefixMatch = part.match(/^([^\d]*)/);
				replaced = true;
				return `${prefixMatch ? prefixMatch[1] : ""}${newVersionStr}`;
			}
			return part;
		});

		// Pure upper bounds ("*" handling aside) — nothing safe to bump
		return replaced ? bumped.join(" ") : range;
	}
}
