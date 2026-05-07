import { NpmClientResult } from "../types";

export class NpmClient {
	private registryUrl: string;
	private activeRequests: number = 0;
	private requestQueue: (() => void)[] = [];
	private readonly MAX_CONCURRENT_REQUESTS = 5;

	constructor(registryUrl: string = "https://registry.npmjs.org") {
		this.registryUrl = registryUrl.replace(/\/$/, "");
	}

	public async fetchPackageInfo(packageName: string): Promise<NpmClientResult> {
		await this.enqueue();
		try {
			return await this.doFetch(packageName);
		} finally {
			this.dequeue();
		}
	}

	private enqueue(): Promise<void> {
		if (this.activeRequests < this.MAX_CONCURRENT_REQUESTS) {
			this.activeRequests++;
			return Promise.resolve();
		}
		return new Promise((resolve) => {
			this.requestQueue.push(resolve);
		});
	}

	private dequeue(): void {
		this.activeRequests--;
		const next = this.requestQueue.shift();
		if (next) {
			this.activeRequests++;
			next();
		}
	}

	private async doFetch(packageName: string): Promise<NpmClientResult> {
		const url = `${this.registryUrl}/${packageName}`;

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 10000);

			const response = await fetch(url, {
				signal: controller.signal,
				headers: {
					Accept: "application/vnd.npm.install-v1+json",
				},
			});
			clearTimeout(timeoutId);

			if (response.status === 404) {
				return {
					package: { name: packageName, latestVersion: "" },
					exists: false,
					error: "Package not found",
				};
			}

			if (!response.ok) {
				return {
					package: { name: packageName, latestVersion: "" },
					exists: false,
					error: `Registry returned ${response.status}`,
				};
			}

			const json: any = await response.json();
			const latestVersion = json["dist-tags"]?.latest;

			if (!latestVersion) {
				return {
					package: { name: packageName, latestVersion: "" },
					exists: true,
					error: "No latest version found",
				};
			}

			return {
				package: {
					name: packageName,
					latestVersion,
					summary: json.description,
					homepage: json.homepage,
				},
				exists: true,
			};
		} catch (e: any) {
			return {
				package: { name: packageName, latestVersion: "" },
				exists: false,
				error: e.name === "AbortError" ? "Request timed out" : e.message,
			};
		}
	}
}
