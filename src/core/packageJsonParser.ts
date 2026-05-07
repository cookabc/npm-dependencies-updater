import { parseTree } from "jsonc-parser";
import { ParsedDependency } from "../types";

export class PackageJsonParser {
	public parse(text: string): ParsedDependency[] {
		const dependencies: ParsedDependency[] = [];
		const tree = parseTree(text);

		if (!tree) {
			return dependencies;
		}

		const processSection = (sectionName: string, isDev: boolean) => {
			const section = tree.children?.find(
				(c) => c.children?.[0].value === sectionName,
			);
			if (!section || !section.children?.[1]) {
				return;
			}

			const depsNode = section.children[1];
			if (depsNode.type !== "object" || !depsNode.children) {
				return;
			}

			for (const child of depsNode.children) {
				if (
					child.type !== "property" ||
					!child.children ||
					child.children.length !== 2
				) {
					continue;
				}

				const keyNode = child.children[0];
				const valueNode = child.children[1];

				if (keyNode.type !== "string" || valueNode.type !== "string") {
					continue;
				}

				const name = keyNode.value;
				const currentVersion = valueNode.value;

				dependencies.push({
					name,
					currentVersion,
					isDev,
					nameRange: {
						start: keyNode.offset,
						end: keyNode.offset + keyNode.length,
					},
					versionRange: {
						start: valueNode.offset,
						end: valueNode.offset + valueNode.length,
					},
				});
			}
		};

		processSection("dependencies", false);
		processSection("devDependencies", true);
		processSection("peerDependencies", false);
		processSection("optionalDependencies", false);

		return dependencies;
	}
}
