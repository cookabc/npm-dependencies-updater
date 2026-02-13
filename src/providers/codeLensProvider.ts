import * as vscode from 'vscode';
import { PackageJsonParser } from '../core/packageJsonParser';
import { VersionService } from './versionService';
import { VersionResolver } from '../core/versionResolver';
import { UpdateRisk, PackageVersionInfo, ParsedDependency } from '../types';
import { StatusBarManager } from '../utils/statusBar';

export class NpmCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    private parser: PackageJsonParser;
    private versionService: VersionService;
    private statusBar: StatusBarManager;
    private pendingFetches: Set<string> = new Set();

    constructor(versionService: VersionService, statusBar: StatusBarManager) {
        this.parser = new PackageJsonParser();
        this.versionService = versionService;
        this.statusBar = statusBar;
    }

    public refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }

    public async provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken): Promise<vscode.CodeLens[]> {
        const lenses: vscode.CodeLens[] = [];
        const dependencies = this.parser.parse(document.getText());

        let totalUpdates = 0;
        let hasRiskyUpdates = false;
        let allChecked = true;

        for (const dep of dependencies) {
            const startPos = document.positionAt(dep.nameRange.start);
            const endPos = document.positionAt(dep.nameRange.end);
            const range = new vscode.Range(startPos, endPos);

            const info = this.versionService.getCachedPackageInfo(dep.name);
            
            if (info) {
                const isUpdateAvailable = VersionResolver.isUpdateAvailable(dep.currentVersion, info.latestVersion);
                if (isUpdateAvailable) {
                    totalUpdates++;
                    const risk = VersionResolver.calculateUpdateRisk(dep.currentVersion, info.latestVersion);
                    if (risk === UpdateRisk.High) {
                        hasRiskyUpdates = true;
                    }
                }
                this.createCodeLenses(lenses, document, dep, info, range);
            } else {
                allChecked = false;
                // Show Checking... state
                const cmd: vscode.Command = {
                    title: '$(sync~spin) Checking...',
                    command: '',
                    tooltip: 'Fetching version info from NPM...'
                };
                lenses.push(new vscode.CodeLens(range, cmd));

                // Trigger background fetch if not already pending
                if (!this.pendingFetches.has(dep.name)) {
                    this.fetchVersionInBackground(dep.name);
                }
            }
        }

        if (!allChecked) {
            this.statusBar.showChecking();
        } else {
            this.statusBar.update(totalUpdates, hasRiskyUpdates);
        }

        return lenses;
    }

    private async fetchVersionInBackground(packageName: string) {
        this.pendingFetches.add(packageName);
        try {
            await this.versionService.getPackageInfo(packageName);
            // Once fetched (cached), trigger refresh
            this._onDidChangeCodeLenses.fire();
        } catch (e) {
            console.error(`Failed to fetch version for ${packageName}`, e);
        } finally {
            this.pendingFetches.delete(packageName);
        }
    }

    private createCodeLenses(lenses: vscode.CodeLens[], document: vscode.TextDocument, dep: ParsedDependency, info: PackageVersionInfo, range: vscode.Range) {
        // For replacement, we use versionRange
        const versionStartPos = document.positionAt(dep.versionRange.start);
        const versionEndPos = document.positionAt(dep.versionRange.end);
        const versionRange = new vscode.Range(versionStartPos, versionEndPos);

        const isUpdateAvailable = VersionResolver.isUpdateAvailable(dep.currentVersion, info.latestVersion);
        
        // 1. Add Update/Status CodeLens (First)
        if (isUpdateAvailable) {
            const risk = VersionResolver.calculateUpdateRisk(dep.currentVersion, info.latestVersion);
            
            let title = '';
            let tooltip = `Latest version: ${info.latestVersion}`;

            if (risk === UpdateRisk.High) {
                title = `$(warning) Upgrade to ${info.latestVersion} ⚠️ Major`;
                tooltip += ` (Major Update)`;
            } else if (risk === UpdateRisk.Medium) {
                title = `$(info) Upgrade to ${info.latestVersion} Minor`;
                tooltip += ` (Minor Update)`;
            } else {
                title = `$(arrow-circle-up) Upgrade to ${info.latestVersion}`;
                tooltip += ` (Patch Update)`;
            }
            
            const cmd: vscode.Command = {
                title: title,
                tooltip: tooltip,
                command: 'npmDeps.updateVersion',
                arguments: [document.uri, versionRange, dep.currentVersion, info.latestVersion]
            };
            
            lenses.push(new vscode.CodeLens(range, cmd));
        } else {
            const cmd: vscode.Command = {
                title: '$(check-all) Up to date',
                tooltip: `Latest version: ${info.latestVersion}`,
                command: 'npmDeps.showUpToDate',
                arguments: [dep.name, info.latestVersion]
            };
            lenses.push(new vscode.CodeLens(range, cmd));
        }

        // 2. Add NPM Link Lens (Second)
        const linkCmd: vscode.Command = {
            title: '$(link-external) NPM',
            tooltip: 'Open on NPM',
            command: 'npmDeps.openOnNpm',
            arguments: [dep.name]
        };
        lenses.push(new vscode.CodeLens(range, linkCmd));
    }
}
