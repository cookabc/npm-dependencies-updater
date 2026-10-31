/**
 * UAT suite — runs inside a real VS Code instance launched by scripts/uat.mjs.
 * Exercises the extension end-to-end against a local mock npm registry.
 */
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { PackageJsonParser } from "../../core/packageJsonParser";
import { VersionService } from "../../providers/versionService";

const NPM = process.env.UAT_NPM ?? "http://127.0.0.1:0";
const FIXTURE =
	process.env.UAT_FIXTURE ??
	path.resolve(__dirname, "../../../scripts/uat-fixture");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const parser = new PackageJsonParser();

async function lensesFor(doc: vscode.TextDocument): Promise<vscode.CodeLens[]> {
	return (
		(await vscode.commands.executeCommand<vscode.CodeLens[]>(
			"vscode.executeCodeLensProvider",
			doc.uri,
			200,
		)) ?? []
	);
}

interface LensSummary {
	title: string;
	cmd: string;
	args: unknown[];
}

function summarize(lenses: vscode.CodeLens[]): LensSummary[] {
	return lenses.map((l) => ({
		title: l.command?.title ?? "(no command)",
		cmd: l.command?.command ?? "(none)",
		args: l.command?.arguments ?? [],
	}));
}

async function waitForLenses(
	doc: vscode.TextDocument,
	pred: (lenses: vscode.CodeLens[]) => boolean,
	timeoutMs = 20000,
): Promise<vscode.CodeLens[]> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const lenses = await lensesFor(doc);
		if (pred(lenses)) {
			return lenses;
		}
		if (Date.now() > deadline) {
			assert.fail(
				`lenses did not settle; got:\n${JSON.stringify(summarize(lenses), null, 1)}`,
			);
		}
		await sleep(300);
	}
}

export async function run(): Promise<void> {
	const pkgDoc = await vscode.workspace.openTextDocument(
		path.join(FIXTURE, "package.json"),
	);

	// ---------- lenses resolve against the mock registry ----------
	const lenses = await waitForLenses(pkgDoc, (ls) => {
		const updateLenses = ls.filter(
			(l) => l.command?.command === "npmDeps.updateVersion",
		);
		return updateLenses.length >= 2;
	});
	// 5 dependencies (3 deps + 1 dev + 1 peer) × 2 lenses each, plus whatever
	// vulnerability shields the OSV stub produced. Count by kind so a new
	// lens type does not silently change what this assertion means.
	assert.strictEqual(
		lenses.filter((l) => l.command?.command === "npmDeps.openOnNpm").length,
		5,
		`expected 5 npm link lenses, got: ${JSON.stringify(lenses.map((l) => l.command?.command))}`,
	);
	assert.strictEqual(
		lenses.filter((l) => l.command?.command === "npmDeps.showVulnerabilities")
			.length,
		1,
		"the pinned vulnerable package should carry exactly one shield",
	);

	// react: 17.0.2 → 17.0.3 (patch, no modal)
	const reactLens = lenses.find(
		(l) =>
			l.command?.command === "npmDeps.updateVersion" &&
			l.command.arguments?.[2] === "react",
	);
	assert.ok(reactLens, "no update lens for react");
	assert.ok(
		String(reactLens.command?.title).includes("17.0.3"),
		`react lens should suggest 17.0.3, got: ${reactLens.command?.title}`,
	);

	// ---------- hover uses the FULL document for description/homepage ----------
	const text = pkgDoc.getText();
	const reactNameOffset = text.indexOf('"react"') + 1; // inside the key
	const hoverPos = pkgDoc.positionAt(reactNameOffset);
	const hovers =
		(await vscode.commands.executeCommand<vscode.Hover[]>(
			"vscode.executeHoverProvider",
			pkgDoc.uri,
			hoverPos,
		)) ?? [];
	const hoverText = hovers
		.flatMap((h) => h.contents)
		.map((c) => (c instanceof vscode.MarkdownString ? c.value : String(c)))
		.join("\n");
	assert.ok(
		hoverText.includes("React is a library for building user interfaces"),
		`hover should carry the full-document description, got: ${hoverText}`,
	);
	assert.ok(
		hoverText.includes("https://react.dev"),
		`hover should carry the homepage link, got: ${hoverText}`,
	);

	// ---------- updateVersion survives a stale range ----------
	// Capture react's version range, then edit the document above it so the
	// captured offsets no longer point at the version string.
	const deps = parser.parse(pkgDoc.getText());
	const reactDep = deps.find((d) => d.name === "react")!;
	const staleRange = new vscode.Range(
		pkgDoc.positionAt(reactDep.versionRange.start),
		pkgDoc.positionAt(reactDep.versionRange.end),
	);
	const firstLine = new vscode.Position(0, 0);
	const edit = new vscode.WorkspaceEdit();
	edit.insert(pkgDoc.uri, firstLine, "// a comment line inserted above\n");

	// The edit is applied asynchronously, and applyEdit can resolve before the
	// buffer reflects it. updateVersion re-locates the dependency by reading
	// the document, so wait until the inserted line is actually visible.
	await vscode.workspace.applyEdit(edit);
	{
		const deadline = Date.now() + 10000;
		while (!pkgDoc.getText().startsWith("// a comment line inserted above")) {
			if (Date.now() > deadline) {
				assert.fail("the inserted comment never showed up in the document");
			}
			await sleep(100);
		}
	}

	await vscode.commands.executeCommand(
		"npmDeps.updateVersion",
		pkgDoc.uri,
		staleRange,
		"react",
		"17.0.2",
		"17.0.3",
	);
	const updatedText = pkgDoc.getText();
	assert.ok(
		updatedText.includes('"react": "17.0.3"'),
		`react should be bumped despite the stale range:\n${updatedText}`,
	);
	assert.ok(
		updatedText.includes("// a comment line inserted above"),
		"the inserted comment must survive the update",
	);
	// nothing else may have been touched by the stale-range replacement
	assert.strictEqual(
		(updatedText.match(/17\.0\.3/g) ?? []).length,
		1,
		"exactly one 17.0.3 in the document",
	);

	// ---------- 404 → error lens with retry ----------
	// nullpkg 404s; after its fetch fails the lens offers the retry command
	const nullLens = await waitForLenses(pkgDoc, (ls) =>
		Boolean(
			ls.find(
				(l) =>
					l.command?.command === "npmDeps.retryFetch" &&
					l.command.arguments?.[0] === "nullpkg",
			),
		),
	);
	const retryLens = nullLens.find(
		(l) =>
			l.command?.command === "npmDeps.retryFetch" &&
			l.command.arguments?.[0] === "nullpkg",
	)!;
	assert.ok(
		String(retryLens.command?.title).includes("Check failed"),
		`error lens should say check failed, got: ${retryLens.command?.title}`,
	);

	// ---------- Update All: bumps non-peer, leaves peer and unknown alone ----------
	await vscode.window.showTextDocument(pkgDoc);
	await vscode.commands.executeCommand("npmDeps.updateAllVersions");
	const afterAll = pkgDoc.getText();
	assert.ok(
		afterAll.includes('"react": "17.0.3"'),
		`react should stay at 17.0.3 after update-all:\n${afterAll}`,
	);
	assert.ok(
		afterAll.includes('"@scope/thing": "1.1.0"'),
		`@scope/thing should be bumped to 1.1.0:\n${afterAll}`,
	);
	assert.ok(
		afterAll.includes('"leftpad": "1.3.0"'),
		"leftpad is already up to date",
	);
	assert.ok(
		afterAll.includes('"react-dom": "^17.0.0"'),
		`peerDependencies must not be batch-updated:\n${afterAll}`,
	);
	assert.ok(
		afterAll.includes('"nullpkg": "^1.0.0"'),
		"unknown package must be left alone",
	);

	// ---------- negative cache suppresses repeat fetches ----------
	async function stats(): Promise<{ notFoundHits: string[] }> {
		const res = await fetch(`${NPM}/__stats`);
		return (await res.json()) as { notFoundHits: string[] };
	}
	const nullHits = (s: { notFoundHits: string[] }) =>
		s.notFoundHits.filter((entry) => entry.startsWith("nullpkg")).length;
	const before = nullHits(await stats());
	// A hover would re-request without the negative cache
	await vscode.commands.executeCommand(
		"vscode.executeHoverProvider",
		pkgDoc.uri,
		pkgDoc.positionAt(pkgDoc.getText().indexOf('"nullpkg"') + 1),
	);
	await sleep(500);
	const after = nullHits(await stats());
	assert.strictEqual(
		after,
		before,
		`hover on a failed package must be served from the negative cache (${before} -> ${after})`,
	);

	// ---------- showPrerelease picks the pre-release as latest ----------
	const service = new VersionService(60, NPM, undefined, true);
	const withPre = await service.getPackageInfo("prerelease-pkg");
	assert.strictEqual(withPre?.latestVersion, "2.0.0-beta.1");
	const service2 = new VersionService(60, NPM, undefined, false);
	const withoutPre = await service2.getPackageInfo("prerelease-pkg");
	assert.strictEqual(withoutPre?.latestVersion, "1.9.0");

	// ---------- vulnerability hints (OSV stub) ----------
	// Read from the fixture as it was on disk, not the edited document: the
	// update tests above moved react off the pinned version the stub reports.
	// react@17.0.2 is vulnerable; leftpad@1.3.0 is clean; @scope/thing and
	// react-dom carry ranges and must never be queried.
	const pristineText = fs.readFileSync(
		path.join(FIXTURE, "package.json"),
		"utf8",
	);
	let shieldLenses: import("vscode").CodeLens[] = [];
	{
		const deadline = Date.now() + 20000;
		for (;;) {
			// One provide pass fills the vulnerability cache for these pins.
			await vscode.commands.executeCommand(
				"npmDeps._uatScanText",
				pristineText,
			);
			const direct = (await vscode.commands.executeCommand(
				"npmDeps._uatVulnerabilityLenses",
				pristineText,
			)) as import("vscode").CodeLens[];
			if (Array.isArray(direct) && direct.length > 0) {
				shieldLenses = direct;
				break;
			}
			if (Date.now() > deadline) {
				assert.fail("shield never appeared for the pinned react");
			}
			await sleep(400);
		}
	}

	assert.strictEqual(
		shieldLenses.length,
		1,
		`exactly the pinned vulnerable package should be flagged, got: ${JSON.stringify(
			shieldLenses.map((l) => l.command?.arguments?.slice(0, 2)),
		)}`,
	);
	const shield = shieldLenses[0];
	assert.strictEqual(
		shield.command?.arguments?.[0],
		"react",
		`the flagged package should be react, got: ${shield.command?.arguments?.[0]}`,
	);
	assert.deepStrictEqual(
		shield.command?.arguments?.[2],
		["GHSA-uat-react-1"],
		`the shield should carry the advisory, got: ${JSON.stringify(shield.command?.arguments?.[2])}`,
	);

	// ---------- a vulnerable destination is blocked by the registered update command ----------
	const targetDir = path.join(FIXTURE, "destination");
	fs.mkdirSync(targetDir, { recursive: true });
	fs.writeFileSync(
		path.join(targetDir, "package.json"),
		JSON.stringify({ dependencies: { dangerpkg: "1.0.0" } }),
	);
	const targetDoc = await vscode.workspace.openTextDocument(
		path.join(targetDir, "package.json"),
	);
	const targetLenses = await waitForLenses(targetDoc, (ls) =>
		ls.some((l) => l.command?.command === "npmDeps.updateVersion"),
	);
	const targetCommand = targetLenses.find(
		(l) => l.command?.command === "npmDeps.updateVersion",
	)?.command;
	assert.ok(targetCommand?.arguments);
	await vscode.commands.executeCommand(
		targetCommand.command,
		...targetCommand.arguments,
	);
	assert.match(targetDoc.getText(), /1\.0\.0/);
	assert.doesNotMatch(targetDoc.getText(), /1\.1\.0/);

	// ---------- lockfile reports render in a native Markdown document ----------
	fs.writeFileSync(
		path.join(FIXTURE, "package-lock.json"),
		JSON.stringify({
			lockfileVersion: 3,
			packages: {
				"": { dependencies: { react: "17.0.2" } },
				"node_modules/react": {
					version: "17.0.2",
					resolved: "https://registry.npmjs.org/react/-/react-17.0.2.tgz",
					dependencies: { dangerpkg: "1.1.0" },
				},
				"node_modules/dangerpkg": {
					version: "1.1.0",
					resolved:
						"https://registry.npmjs.org/dangerpkg/-/dangerpkg-1.1.0.tgz",
				},
			},
		}),
	);
	await vscode.window.showTextDocument(pkgDoc);
	await vscode.commands.executeCommand("npmDeps.dependencyReport");
	const report = vscode.window.activeTextEditor?.document.getText() ?? "";
	assert.match(report, /Dependency report/);
	assert.match(report, /GHSA-uat-destination/);
	assert.match(report, /react@17\.0\.2 → dangerpkg@1\.1\.0/);
	const commands = await vscode.commands.getCommands();
	assert.ok(commands.includes("npmDeps.previewAndValidate"));

	console.log("UAT suite finished OK");
}
