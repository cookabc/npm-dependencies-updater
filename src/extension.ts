import * as vscode from 'vscode';
import { VersionService } from './providers/versionService';
import { NpmCodeLensProvider } from './providers/codeLensProvider';
import { NpmHoverProvider } from './providers/hoverProvider';
import { VersionResolver } from './core/versionResolver';
import { PackageJsonParser } from './core/packageJsonParser';
import { UpdateRisk } from './types';
import { StatusBarManager } from './utils/statusBar';

export function activate(context: vscode.ExtensionContext) {
    console.log('NPM Dependencies Updater is now active!');

    const config = vscode.workspace.getConfiguration('npmDeps');
    const ttl = config.get<number>('cacheTTLMinutes', 60);
    const registryUrl = config.get<string>('registryUrl', 'https://registry.npmjs.org');

    const versionService = new VersionService(ttl, registryUrl);
    const parser = new PackageJsonParser();
    const statusBar = new StatusBarManager();

    // Register Providers
    const codeLensProvider = new NpmCodeLensProvider(versionService, statusBar);
    const hoverProvider = new NpmHoverProvider(versionService);

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
                    `Updating ${currentVersion} to ${newVersion} is a major update. Continue?`,
                    { modal: true },
                    'Update Anyway'
                );
                if (answer !== 'Update Anyway') {
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
            vscode.window.showInformationMessage(`${packageName} is up to date (v${version})`);
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
                vscode.window.showErrorMessage('Please open a package.json file');
                return;
            }

            const document = editor.document;
            const dependencies = parser.parse(document.getText());
            
            // 1. Scan for updates
            const updates: { dep: any, info: any, risk: UpdateRisk }[] = [];
            
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Scanning for updates...",
                cancellable: true
            }, async (progress, token) => {
                for (const dep of dependencies) {
                    if (token.isCancellationRequested) return;
                    progress.report({ message: `Checking ${dep.name}...` });
                    const info = await versionService.getPackageInfo(dep.name);
                    
                    if (info && VersionResolver.isUpdateAvailable(dep.currentVersion, info.latestVersion)) {
                        const risk = VersionResolver.calculateUpdateRisk(dep.currentVersion, info.latestVersion);
                        updates.push({ dep, info, risk });
                    }
                }
            });

            if (updates.length === 0) {
                vscode.window.showInformationMessage('All packages are up to date.');
                return;
            }

            // 2. Classify updates
            const riskyUpdates = updates.filter(u => u.risk === UpdateRisk.High);
            const safeUpdates = updates.filter(u => u.risk !== UpdateRisk.High);

            let updatesToApply = updates;

            // 3. Prompt if risky
            if (riskyUpdates.length > 0) {
                const message = `⚠️ Found ${riskyUpdates.length} major version update(s) that may include breaking changes:\n\n` +
                    riskyUpdates.map(u => `• ${u.dep.name}: ${u.dep.currentVersion} → ${u.info.latestVersion}`).join('\n');
                
                const answer = await vscode.window.showWarningMessage(
                    message,
                    { modal: true },
                    'Update Safe Only',
                    'Update All (Including Risky)'
                );

                if (answer === 'Update Safe Only') {
                    updatesToApply = safeUpdates;
                } else if (answer === 'Update All (Including Risky)') {
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
            vscode.window.showInformationMessage(`Updated ${updatesToApply.length} packages.`);
            codeLensProvider.refresh();
        })
    );
}

export function deactivate() {}
