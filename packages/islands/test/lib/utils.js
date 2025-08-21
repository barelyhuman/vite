//https://github.com/preactjs/@barelyhuman','vite-islands/blob/7467489936a05c58e189eecb5eb2a029b588e28c/tests/lib/utils.js

import path from "node:path";
import url from "node:url";
import { promises as fs } from "node:fs";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export async function copyDependencies(cwd) {
	await fs.mkdir(
		path.join(cwd, "node_modules", "@barelyhuman", "vite-islands"),
		{
			recursive: true,
		},
	);

	// Copy module to tmp dir
	await fs.cp(
		path.join(__dirname, "..", "..", "dist"),
		path.join(cwd, "node_modules", "@barelyhuman", "vite-islands", "dist"),
		{ recursive: true },
	);
	await fs.copyFile(
		path.join(__dirname, "..", "..", "package.json"),
		path.join(
			cwd,
			"node_modules",
			"@barelyhuman",
			"vite-islands",
			"package.json",
		),
	);

	const copyNodeModule = async (nodeModule) =>
		await fs.cp(
			path.join(__dirname, "..", "..", "node_modules", nodeModule),
			path.join(cwd, "node_modules", nodeModule),
			{ recursive: true },
		);

	// Copy dependencies to tmp dir
	await copyNodeModule("vite");
	await copyNodeModule("@preact/preset-vite");
	await copyNodeModule("preact");
	await copyNodeModule("preact-render-to-string");
	await copyNodeModule("@dumbjs/preland");
}

/**
 * Get build output file as utf-8 string
 * @param {string} dir
 * @param {string | RegExp} file
 * @returns {Promise<string>}
 */
export async function getOutputFile(dir, file) {
	if (typeof file !== "string") {
		// @ts-ignore - TS bug, assigning to `file` breaks the narrowing
		file = (await fs.readdir(path.join(dir, "dist"))).find((f) => file.test(f));
	}
	return await fs.readFile(path.join(dir, "dist", file), "utf-8");
}

/**
 * Check to see if output files exists
 * @param {string} dir
 * @param {string} file
 * @returns {Promise<boolean>}
 */
export async function outputFileExists(dir, file) {
	return await fs
		.access(path.join(dir, "dist", file))
		.then(() => true)
		.catch(() => false);
}

/**
 * @param {string} dir
 * @param {string} filePath
 * @param {string} content
 */
export async function writeFixtureFile(dir, filePath, content) {
	await fs.writeFile(path.join(dir, filePath), content);
}

export const stripColors = (str) =>
	str.replace(/\x1b\[(?:[0-9]{1,3}(?:;[0-9]{1,3})*)?[m|K]/g, "");
