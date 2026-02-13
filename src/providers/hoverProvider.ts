import * as vscode from 'vscode';
import { PackageJsonParser } from '../core/packageJsonParser';
import { VersionService } from './versionService';

export class NpmHoverProvider implements vscode.HoverProvider {
    private parser: PackageJsonParser;
    private versionService: VersionService;

    constructor(versionService: VersionService) {
        this.parser = new PackageJsonParser();
        this.versionService = versionService;
    }

    public async provideHover(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken): Promise<vscode.Hover | undefined> {
        const dependencies = this.parser.parse(document.getText());
        
        // Find dependency where position is within name or version
        // Ideally hover works on both.
        // Let's check nameRange and versionRange.
        
        const offset = document.offsetAt(position);
        
        const dep = dependencies.find(d => 
            (offset >= d.nameRange.start && offset <= d.nameRange.end) ||
            (offset >= d.versionRange.start && offset <= d.versionRange.end)
        );

        if (!dep) {
            return undefined;
        }

        const info = await this.versionService.getPackageInfo(dep.name);
        if (!info) {
            return new vscode.Hover(`Checking ${dep.name}...`);
        }

        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${info.name}**\n\n`);
        if (info.summary) {
            md.appendMarkdown(`${info.summary}\n\n`);
        }
        md.appendMarkdown(`Latest: **${info.latestVersion}**\n`);
        md.appendMarkdown(`Current: **${dep.currentVersion}**\n\n`);
        
        if (info.homepage) {
            md.appendMarkdown(`[Homepage](${info.homepage})`);
        }

        return new vscode.Hover(md);
    }
}
