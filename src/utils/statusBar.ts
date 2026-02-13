import * as vscode from 'vscode';

export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.command = 'npmDeps.updateAllVersions';
        this.reset();
        this.statusBarItem.show();
    }

    public showChecking() {
        this.statusBarItem.text = '$(sync~spin) Checking dependencies...';
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.tooltip = 'Scanning for updates...';
    }

    public update(updateCount: number, hasRiskyUpdates: boolean) {
        if (updateCount === 0) {
            this.statusBarItem.text = '$(check) Dependencies up to date';
            this.statusBarItem.backgroundColor = undefined;
            this.statusBarItem.tooltip = 'All dependencies are up to date';
        } else {
            this.statusBarItem.text = `$(warning) ${updateCount} updates available`;
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            
            const riskyText = hasRiskyUpdates ? ' (Includes major updates)' : '';
            this.statusBarItem.tooltip = `Click to update ${updateCount} packages${riskyText}`;
        }
    }

    public reset() {
        this.statusBarItem.text = '$(package) NPM Dependencies';
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.tooltip = 'NPM Dependencies Updater';
    }

    public dispose() {
        this.statusBarItem.dispose();
    }
}
