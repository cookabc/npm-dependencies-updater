import * as https from 'https';
import { NpmClientResult } from '../types';

export class NpmClient {
    private registryUrl: string;

    constructor(registryUrl: string = 'https://registry.npmjs.org') {
        this.registryUrl = registryUrl.replace(/\/$/, '');
    }

    public async fetchPackageInfo(packageName: string): Promise<NpmClientResult> {
        return new Promise((resolve) => {
            const url = `${this.registryUrl}/${packageName}`;
            
            const req = https.get(url, (res) => {
                if (res.statusCode === 404) {
                    resolve({
                        package: { name: packageName, latestVersion: '' },
                        exists: false,
                        error: 'Package not found'
                    });
                    return;
                }

                if (res.statusCode !== 200) {
                    resolve({
                        package: { name: packageName, latestVersion: '' },
                        exists: false,
                        error: `Registry returned ${res.statusCode}`
                    });
                    return;
                }

                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        const latestVersion = json['dist-tags']?.latest;
                        
                        if (!latestVersion) {
                            resolve({
                                package: { name: packageName, latestVersion: '' },
                                exists: true,
                                error: 'No latest version found'
                            });
                            return;
                        }

                        resolve({
                            package: {
                                name: packageName,
                                latestVersion,
                                summary: json.description,
                                homepage: json.homepage
                            },
                            exists: true
                        });
                    } catch (e: any) {
                        resolve({
                            package: { name: packageName, latestVersion: '' },
                            exists: false,
                            error: `Failed to parse response: ${e.message}`
                        });
                    }
                });
            });

            req.on('error', (e) => {
                resolve({
                    package: { name: packageName, latestVersion: '' },
                    exists: false,
                    error: e.message
                });
            });

            req.setTimeout(10000, () => {
                req.destroy();
                resolve({
                    package: { name: packageName, latestVersion: '' },
                    exists: false,
                    error: 'Request timed out'
                });
            });
        });
    }
}
