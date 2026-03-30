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
    // Preserve prefix (like ^, ~, >=)
    const prefixMatch = currentVersionStr.match(/^([^\d]*)/);
    const prefix = prefixMatch ? prefixMatch[1] : "";

    return `${prefix}${newVersionStr}`;
  }
}
