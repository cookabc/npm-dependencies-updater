import * as vscode from "vscode";
import { t } from "./i18n";

export class StatusBarManager {
	private statusBarItem: vscode.StatusBarItem;

	constructor() {
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Right,
			100,
		);
		this.statusBarItem.command = "npmDeps.updateAllVersions";
		this.reset();
	}

	/** Visible once a package.json with dependencies has been analysed */
	public showNow() {
		this.statusBarItem.show();
	}

	public showChecking() {
		this.statusBarItem.text = `$(sync~spin) ${t("checkingDeps")}`;
		this.statusBarItem.backgroundColor = undefined;
		this.statusBarItem.tooltip = t("scanning");
		this.statusBarItem.show();
	}

	/**
	 * `vulnerable` counts pinned dependencies with at least one known
	 * advisory. It takes precedence over the update count: a known
	 * vulnerability matters more than a version being behind.
	 */
	public update(
		updateCount: number,
		hasRiskyUpdates: boolean,
		vulnerable: number = 0,
	) {
		if (vulnerable > 0) {
			this.statusBarItem.text = `$(shield) ${t("vulnerable", vulnerable)}`;
			this.statusBarItem.tooltip = t("statusBarVulnerable", vulnerable);
			this.statusBarItem.backgroundColor = new vscode.ThemeColor(
				"statusBarItem.errorBackground",
			);
			this.statusBarItem.show();
			return;
		}

		if (updateCount === 0) {
			this.statusBarItem.text = `$(check) ${t("upToDate")}`;
			this.statusBarItem.backgroundColor = undefined;
			this.statusBarItem.tooltip = t("allUpToDate");
			this.statusBarItem.show();
		} else {
			this.statusBarItem.text = `$(warning) ${updateCount} ${t("updatesAvailable")}`;
			this.statusBarItem.backgroundColor = new vscode.ThemeColor(
				"statusBarItem.warningBackground",
			);

			const riskyText = hasRiskyUpdates ? t("includesMajor") : "";
			this.statusBarItem.tooltip = `${t("clickToUpdate")} ${t("updatesTooltip", updateCount)}${riskyText}`;
			this.statusBarItem.show();
		}
	}

	public reset() {
		this.statusBarItem.text = `$(package) ${t("npmDeps")}`;
		this.statusBarItem.backgroundColor = undefined;
		this.statusBarItem.tooltip = "NPM Dependencies Updater";
	}

	public dispose() {
		this.statusBarItem.dispose();
	}
}
