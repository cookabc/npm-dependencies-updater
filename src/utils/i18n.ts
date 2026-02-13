/**
 * Internationalization support for NPM Dependencies Updater
 */

import * as vscode from 'vscode';

interface Messages {
    updateTo: string;
    upToDate: string;
    checking: string;
    checkingDeps: string;
    scanning: string;
    updatesAvailable: string;
    includesMajor: string;
    clickToUpdate: string;
    npmDeps: string;
    checkFailed: string;
    majorUpdate: string;
    minorUpdate: string;
    patchUpdate: string;
    packageNotFound: string;
    connectionFailed: string;
    openPackageJson: string;
    allUpToDate: string;
    majorWarning: string;
    updateAnyway: string;
    packageUpToDate: string;
    updatedCount: string;
    majorFound: string;
    updateSafeOnly: string;
    updateAllRisky: string;
    latest: string;
}

const messages: Record<string, Messages> = {
    'en': {
        updateTo: 'Update to',
        upToDate: 'Up to date',
        checking: 'Checking',
        checkingDeps: 'Checking dependencies...',
        scanning: 'Scanning for updates...',
        updatesAvailable: 'updates available',
        includesMajor: ' (Includes major updates)',
        clickToUpdate: 'Click to update',
        npmDeps: 'NPM Dependencies',
        checkFailed: 'Check failed',
        majorUpdate: 'Major Update',
        minorUpdate: 'Minor Update',
        patchUpdate: 'Patch Update',
        packageNotFound: 'Package not found',
        connectionFailed: 'Connection failed',
        openPackageJson: 'Please open a package.json file',
        allUpToDate: 'All dependencies are up to date',
        majorWarning: 'is a major update. Continue?',
        updateAnyway: 'Update Anyway',
        packageUpToDate: 'is up to date',
        updatedCount: 'Updated {0} packages.',
        majorFound: 'Found {0} major version update(s) that may include breaking changes:',
        updateSafeOnly: 'Update Safe Only',
        updateAllRisky: 'Update All (Including Risky)',
        latest: 'Latest'
    },
    'zh-cn': {
        updateTo: '更新到',
        upToDate: '已是最新',
        checking: '检查中',
        checkingDeps: '正在检查依赖...',
        scanning: '正在扫描更新...',
        updatesAvailable: '个可用的更新',
        includesMajor: ' (包含重大更新)',
        clickToUpdate: '点击更新',
        npmDeps: 'NPM 依赖项',
        checkFailed: '检查失败',
        majorUpdate: '重大更新',
        minorUpdate: '次要更新',
        patchUpdate: '补丁更新',
        packageNotFound: '未找到包',
        connectionFailed: '连接失败',
        openPackageJson: '请打开 package.json 文件',
        allUpToDate: '所有依赖项均已是最新',
        majorWarning: '是一个重大更新。是否继续？',
        updateAnyway: '仍然更新',
        packageUpToDate: '已是最新',
        updatedCount: '已更新 {0} 个包。',
        majorFound: '发现 {0} 个重大版本更新，可能包含破坏性变更：',
        updateSafeOnly: '仅更新安全版本',
        updateAllRisky: '全部更新 (包含风险)',
        latest: '最新版本'
    }
};

function getLocale(): string {
    const locale = vscode.env.language.toLowerCase();
    if (messages[locale]) {
        return locale;
    }
    const language = locale.split('-')[0];
    if (language === 'zh') {
        return locale.includes('tw') || locale.includes('hk') ? 'zh-tw' : 'zh-cn';
    }
    return 'en';
}

export function t(key: keyof Messages, ...args: any[]): string {
    const locale = getLocale();
    let msg = messages[locale]?.[key] || messages['en'][key];
    if (args.length > 0) {
        args.forEach((arg, i) => {
            msg = msg.replace(`{${i}}`, String(arg));
        });
    }
    return msg;
}
