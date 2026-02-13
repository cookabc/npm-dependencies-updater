import * as vscode from 'vscode';
import { PackageJsonParser } from '../core/packageJsonParser';
import { VersionService } from './versionService';
import { VersionResolver } from '../core/versionResolver';
import { UpdateRisk, PackageVersionInfo, ParsedDependency } from '../types';
import { StatusBarManager } from '../utils/statusBar';
import { t } from '../utils/i18n';
import { Logger } from '../utils/logger';

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
            } else {
                allChecked = false;
            }

            // Create a placeholder CodeLens with the dependency data
            const lens = new vscode.CodeLens(range);
            (lens as any).dependency = dep;
            (lens as any).documentUri = document.uri;
            lenses.push(lens);

            // Also add the NPM link CodeLens immediately as it doesn't need resolution
            const linkCmd: vscode.Command = {
                title: '$(link-external) NPM',
                tooltip: 'Open on NPM',
                command: 'npmDeps.openOnNpm',
                arguments: [dep.name]
            };
            lenses.push(new vscode.CodeLens(range, linkCmd));
        }

        if (!allChecked) {
            this.statusBar.showChecking();
        } else {
            this.statusBar.update(totalUpdates, hasRiskyUpdates);
        }

        return lenses;
    }

    public async resolveCodeLens(codeLens: vscode.CodeLens, _token: vscode.CancellationToken): Promise<vscode.CodeLens> {
        const dep = (codeLens as any).dependency as ParsedDependency;
        const uri = (codeLens as any).documentUri as vscode.Uri;
        
        if (!dep) {
            return codeLens;
        }

        const info = this.versionService.getCachedPackageInfo(dep.name);
        
        if (info) {
            const isUpdateAvailable = VersionResolver.isUpdateAvailable(dep.currentVersion, info.latestVersion);
            const versionRange = this.getVersionRange(uri, dep);
            
            if (isUpdateAvailable) {
                const risk = VersionResolver.calculateUpdateRisk(dep.currentVersion, info.latestVersion);
                let title = '';
                let tooltip = `${t('upToDate')}: ${info.latestVersion}`;

                if (risk === UpdateRisk.High) {
                    title = `$(warning) ${t('updateTo')} ${info.latestVersion} ⚠️ ${t('majorUpdate')}`;
                    tooltip += ` (${t('majorUpdate')})`;
                } else if (risk === UpdateRisk.Medium) {
                    title = `$(info) ${t('updateTo')} ${info.latestVersion} ${t('minorUpdate')}`;
                    tooltip += ` (${t('minorUpdate')})`;
                } else {
                    title = `$(arrow-circle-up) ${t('updateTo')} ${info.latestVersion}`;
                    tooltip += ` (${t('patchUpdate')})`;
                }
                
                codeLens.command = {
                    title: title,
                    tooltip: tooltip,
                    command: 'npmDeps.updateVersion',
                    arguments: [uri, versionRange, dep.currentVersion, info.latestVersion]
                };
            } else {
                codeLens.command = {
                    title: `$(check-all) ${t('upToDate')}`,
                    tooltip: `${t('upToDate')}: ${info.latestVersion}`,
                    command: 'npmDeps.showUpToDate',
                    arguments: [dep.name, info.latestVersion]
                };
            }
        } else {
            codeLens.command = {
                title: `$(sync~spin) ${t('checking')}...`,
                command: '',
                tooltip: t('scanning')
            };

            if (!this.pendingFetches.has(dep.name)) {
                this.fetchVersionInBackground(dep.name);
            }
        }

        return codeLens;
    }

    private getVersionRange(uri: vscode.Uri, dep: ParsedDependency): vscode.Range {
        const document = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
        if (!document) {
            // Fallback: This shouldn't happen in normal usage
            return new vscode.Range(0, 0, 0, 0);
        }
        const versionStartPos = document.positionAt(dep.versionRange.start);
        const versionEndPos = document.positionAt(dep.versionRange.end);
        return new vscode.Range(versionStartPos, versionEndPos);
    }

    private async fetchVersionInBackground(packageName: string) {
        this.pendingFetches.add(packageName);
        try {
            await this.versionService.getPackageInfo(packageName);
            this._onDidChangeCodeLenses.fire();
        } catch (e) {
            Logger.error(`Failed to fetch version for ${packageName}`, e);
        } finally {
            this.pendingFetches.delete(packageName);
        }
    }
}
