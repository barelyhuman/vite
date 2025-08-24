import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { DirectoryResult } from "tmp-promise";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
	loadFixture,
	setupTest,
	teardownTest,
	viteBuild,
} from "./lib/setup.js";

type TestCtx = { env: { tmp: DirectoryResult } };

beforeEach<TestCtx>(async (ctx) => {
	ctx.env = await setupTest();
});

afterEach<TestCtx>(async (ctx) => {
	await teardownTest(ctx.env);
});

test(".islands are generated on build | smoke", async (ctx: TestCtx) => {
	await loadFixture("basic", ctx.env);

	let message = "";
	try {
		await viteBuild(ctx.env.tmp.path);
	} catch (error) {
		message = error.message;
	}

	expect(message).toBe("");

	// Testable files exist
	expect(existsSync(join(ctx.env.tmp.path, ".islands"))).toBeTruthy();
	expect(existsSync(join(ctx.env.tmp.path, "dist", "index.js"))).toBeTruthy();

	// To check if the output files are being hashed
	expect(
		await readdir(join(ctx.env.tmp.path, ".islands")),
	).toMatchInlineSnapshot(`
		[
		  "island-counter--4218868510.js",
		  "island-counter-6904939328.js",
		]
	`);

	const builtServerFile = await readFile(
		join(ctx.env.tmp.path, "dist", "index.js"),
		"utf8",
	);

	const islandFile = await readFile(
		join(ctx.env.tmp.path, ".islands", "island-counter--4218868510.js"),
		"utf8",
	);

	const islandWithSameNamedComponent = await readFile(
		join(ctx.env.tmp.path, ".islands", "island-counter-6904939328.js"),
		"utf8",
	);

	// web components are declared properly
	expect(islandFile).includes('customElements.define("island-counter",');
	expect(islandWithSameNamedComponent).includes(
		'customElements.define("island-counter-1",',
	);

	// utilities are inlined
	expect(islandFile).includes("const restoreTree = (type, props = {}) => {");
	expect(islandWithSameNamedComponent).includes(
		"const restoreTree = (type, props = {}) => {",
	);

	// deps were injected
	expect(islandFile).includes("import { render, h } from 'preact';");
	expect(islandWithSameNamedComponent).includes(
		"import { render, h } from 'preact';",
	);

	// server has the islands with right suffixes
	expect(builtServerFile).include('h("island-counter"');
	expect(builtServerFile).include('h("island-counter-1"');
});
