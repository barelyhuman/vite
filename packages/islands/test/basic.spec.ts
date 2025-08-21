import { existsSync } from "node:fs";
import {
	loadFixture,
	setupTest,
	teardownTest,
	viteBuild,
} from "./lib/setup.js";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DirectoryResult } from "tmp-promise";
import { afterEach, beforeEach, expect, test } from "vitest";

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

	expect(existsSync(join(ctx.env.tmp.path, ".islands"))).toBeTruthy();

	expect(
		await readdir(join(ctx.env.tmp.path, ".islands")),
	).toMatchInlineSnapshot(`
		[
		  "island-counter--4218868510.js",
		]
	`);

	const islandFile = await readFile(
		join(ctx.env.tmp.path, ".islands", "island-counter--4218868510.js"),
		"utf8",
	);
	
	// web component is declared properly
	expect(islandFile).includes("customElements.define(\"island-counter\",")

	// utilities are inlines
	expect(islandFile).includes("const restoreTree = (type, props = {}) => {")

	// deps were injected 
	expect(islandFile).includes("import { render, h } from 'preact';")
});


