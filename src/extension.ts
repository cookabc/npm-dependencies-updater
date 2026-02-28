import * as vscode from 'vscode';
import { VersionService } from './providers/versionService';
import { NpmCodeLensProvider } from './providers/codeLensProvider';
import { NpmHoverProvider } from './providers/hoverProvider';
import { VersionResolver } from './core/versionResolver';
import { PackageJsonParser } from './core/packageJsonParser';
import { UpdateRisk, ParsedDependency, PackageVersionInfo } from './types';
import { StatusBarManager } from './utils/statusBar';
import { t } from './utils/i18n';
import { Logger } from './utils/logger';

export function activate(context: vscode.ExtensionContext) {
    Logger.init('NPM Dependencies');
    Logger.log(t('npmDeps') + ' is now active!');

    const config = vscode.workspace.getConfiguration('npmDeps');
    const ttl = config.get<number>('cacheTTLMinutes', 60);
    const registryUrl = config.get<string>('registryUrl', 'https://registry.npmjs.org');
    const enabled = config.get<boolean>('enabled', true);

    const versionService = new VersionService(ttl, registryUrl, context.globalState);
    const parser = new PackageJsonParser();
    const statusBar = new StatusBarManager();

    // Register Providers
    const codeLensProvider = new NpmCodeLensProvider(versionService, statusBar, enabled);
    const hoverProvider = new NpmHoverProvider(versionService, enabled);

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('npmDeps')) {
                const newConfig = vscode.workspace.getConfiguration('npmDeps');
                const newEnabled = newConfig.get<boolean>('enabled', true);
                const newTtl = newConfig.get<number>('cacheTTLMinutes', 60);
                const newRegistryUrl = newConfig.get<string>('registryUrl', 'https://registry.npmjs.org');
                versionService.updateConfiguration(newTtl, newRegistryUrl, context.globalState);
                codeLensProvider.setEnabled(newEnabled);
                hoverProvider.setEnabled(newEnabled);
                codeLensProvider.refresh();
            }
        })
    );

    const selector: vscode.DocumentSelector = [
        { language: 'json', pattern: '**/package.json' },
        { language: 'jsonc', pattern: '**/package.json' }
    ];

    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(selector, codeLensProvider),
        vscode.languages.registerHoverProvider(selector, hoverProvider),
        statusBar
    );

    // Register Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('npmDeps.updateVersion', async (uri: vscode.Uri, range: vscode.Range, currentVersion: string, newVersion: string) => {
            const formattedVersion = VersionResolver.formatNewVersion(currentVersion, newVersion);
            
            const risk = VersionResolver.calculateUpdateRisk(currentVersion, newVersion);
            
            if (risk === UpdateRisk.High) {
                const answer = await vscode.window.showWarningMessage(
                    `Updating ${currentVersion} to ${newVersion} ${t('majorWarning')}`,
                    { modal: true },
                    t('updateAnyway')
                );
                if (answer !== t('updateAnyway')) {
                    return;
                }
            }

            const edit = new vscode.WorkspaceEdit();
            edit.replace(uri, range, `"${formattedVersion}"`);
            await vscode.workspace.applyEdit(edit);
            
            // Refresh CodeLens
            codeLensProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('npmDeps.showUpToDate', (packageName: string, version: string) => {
            vscode.window.showInformationMessage(`${packageName} ${t('packageUpToDate')} (v${version})`);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('npmDeps.openOnNpm', (packageName: string) => {
            vscode.env.openExternal(vscode.Uri.parse(`https://www.npmjs.com/package/${packageName}`));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('npmDeps.updateAllVersions', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || !editor.document.fileName.endsWith('package.json')) {
                vscode.window.showErrorMessage(t('openPackageJson'));
                return;
            }

            const document = editor.document;
            const dependencies = parser.parse(document.getText());
            
            // 1. Scan for updates (parallel)
            const updates: { dep: ParsedDependency, info: PackageVersionInfo, risk: UpdateRisk }[] = [];
            
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: t('scanning'),
                cancellable: true
            }, async (progress, token) => {
                let completed = 0;
                const results = await Promise.allSettled(
                    dependencies.map(async (dep) => {
                        if (token.isCancellationRequested) return null;
                        const info = await versionService.getPackageInfo(dep.name);
                        completed++;
                        progress.report({ message: `${t('checking')} (${completed}/${dependencies.length})` });
                        return { dep, info };
                    })
                );

                for (const result of results) {
                    if (result.status === 'fulfilled' && result.value) {
                        const { dep, info } = result.value;
                        if (info && VersionResolver.isUpdateAvailable(dep.currentVersion, info.latestVersion)) {
                            const risk = VersionResolver.calculateUpdateRisk(dep.currentVersion, info.latestVersion);
                            updates.push({ dep, info, risk });
                        }
                    }
                }
            });

            if (updates.length === 0) {
                vscode.window.showInformationMessage(t('allUpToDate'));
                return;
            }

            // 2. Classify updates
            const riskyUpdates = updates.filter(u => u.risk === UpdateRisk.High);
            const safeUpdates = updates.filter(u => u.risk !== UpdateRisk.High);

            let updatesToApply = updates;

            // 3. Prompt if risky
            if (riskyUpdates.length > 0) {
                const message = t('majorFound', riskyUpdates.length) + '\n\n' +
                    riskyUpdates.map(u => `• ${u.dep.name}: ${u.dep.currentVersion} → ${u.info.latestVersion}`).join('\n');
                
                const answer = await vscode.window.showWarningMessage(
                    message,
                    { modal: true },
                    t('updateSafeOnly'),
                    t('updateAllRisky')
                );

                if (answer === t('updateSafeOnly')) {
                    updatesToApply = safeUpdates;
                } else if (answer === t('updateAllRisky')) {
                    updatesToApply = updates;
                } else {
                    return; // Cancel
                }
            }

            if (updatesToApply.length === 0) {
                return;
            }

            // 4. Apply updates
            const edit = new vscode.WorkspaceEdit();
            for (const { dep, info } of updatesToApply) {
                const formattedVersion = VersionResolver.formatNewVersion(dep.currentVersion, info.latestVersion);
                
                // Convert offsets to Range
                const startPos = document.positionAt(dep.versionRange.start);
                const endPos = document.positionAt(dep.versionRange.end);
                const range = new vscode.Range(startPos, endPos);
                
                edit.replace(document.uri, range, `"${formattedVersion}"`);
            }

            await vscode.workspace.applyEdit(edit);
            vscode.window.showInformationMessage(t('updatedCount', updatesToApply.length));
            codeLensProvider.refresh();
        })
    );
}

export function deactivate() {}
