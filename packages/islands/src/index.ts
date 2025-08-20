import {
	getIslandName as _getIslandName,
	findIslands,
	generateClientTemplate,
	getServerTemplatePlaceholder,
	IMPORT_PATH_PLACEHOLDER,
	injectIslandAST,
	isFunctionIsland,
	DEFAULT_TRANSPILED_IDENTIFIERS as PRELAND_DEFAULT_TRANSPILED_IDENTIFIERS,
	readSourceFile,
} from "@dumbjs/preland";

import { addImportToAST, codeFromAST } from "@dumbjs/preland/ast";
import preact from "@preact/preset-vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build, mergeConfig } from "vite";
import type { Plugin } from "vite";

export const DEFAULT_TRANSPILED_IDENTIFIERS = [
	...PRELAND_DEFAULT_TRANSPILED_IDENTIFIERS,
	"_jsxDEV",
];

export type Options = {
	outDir?: string;
	islandsTmpDir?: string;
	transpiledIdentifiers?: string[];
	virtualModulePrefix?: string;
	debug?: boolean;
};

export const islandsPlugin = (options: Options = {}): Plugin => {
	let isBuild = false;
	let viteRootDir: string;
	let viteOutDir: string;
	const islandsDist = options?.outDir || "islands";
	let runningIslandBuild = false;
	let islandsTmpDir: string;
	const transpiledIdentifiers =
		options?.transpiledIdentifiers || DEFAULT_TRANSPILED_IDENTIFIERS;
	const virtualModulePrefix = options?.virtualModulePrefix || "virtual:island-";
	const debug = !!options?.debug;

	const islReg = new IslandRegistry(virtualModulePrefix);

	function logDebug(...args) {
		if (debug) {
			console.log("[islandsPlugin]", ...args);
		}
	}

	return {
		name: "vite-plugin-barelyhuman-islands",
		enforce: "pre",
		config(_, env) {
			isBuild = env.command === "build";
		},
		configResolved(cfg) {
			viteRootDir = cfg.root || process.cwd();
			viteOutDir = cfg.build?.outDir ?? viteOutDir;

			islandsTmpDir = join(viteRootDir, options?.islandsTmpDir || ".islands");
			logDebug("config:", { viteRootDir, viteOutDir, isBuild, islandsTmpDir });
		},
		load: islReg.createViteLoad(),
		resolveId: islReg.createViteResolveId(),
		transform(_, id, viteEnv) {
			if (!/\.(js|ts)x$/.test(id)) return;
			if (!viteEnv?.ssr) return;

			logDebug("transform start:", { id, viteEnv });
			const islands = findIslands(readSourceFile(id), {
				isFunctionIsland: (node) =>
					isFunctionIsland(node, {
						transpiledIdentifiers,
					}),
			});
			logDebug("found islands:", { id, count: islands.length, islands });
			if (!islands.length) return;

			for (const node of islands) {
				//@ts-expect-error FIX: in preland
				injectIslandAST(node.ast, node);
				const clientCode = generateClientTemplate(node.id).replace(
					IMPORT_PATH_PLACEHOLDER,
					id,
				);

				const hashedId = islReg.register(id, node.id, clientCode);

				mkdirSync(islandsTmpDir, { recursive: true });
				const islandTempFileOutPath = join(
					islandsTmpDir,
					`${getIslandName(node.id, hashedId)}.js`,
				);
				writeFileSync(islandTempFileOutPath, clientCode, "utf8");

				logDebug("island client code written:", {
					nodeId: node.id,
					file: islandTempFileOutPath,
				});
			}

			const addImport = addImportToAST(islands[0].ast);
			addImport("h", "preact", { named: true });
			addImport("Fragment", "preact", { named: true });

			let serverTemplateCode = codeFromAST(islands[0].ast);
			for (const island of islands) {
				serverTemplateCode = serverTemplateCode.replace(
					getServerTemplatePlaceholder(island.id),
					!isBuild
						? `/${islReg.virtualPath(id, island.id)}`
						: `/islands/${getIslandName(
								island.id,
								islReg.getHash(id, island.id),
							)}.js`,
				);
				logDebug("server template placeholder replaced:", {
					islandId: island.id,
				});
			}

			logDebug("transform done:", { id });
			return {
				code: serverTemplateCode,
			};
		},
		writeBundle: {
			sequential: true,
			async handler() {
				logDebug("writeBundle start:", {
					regSize: islReg.islandsByHash.size,
				});
				if (islReg.islandsByHash.size === 0) return;
				// if (Object.keys(clientVirtuals).length === 0) return;
				if (runningIslandBuild) return;

				runningIslandBuild = true;
				logDebug("building client islands bundle...", {
					outDir: join(viteOutDir, islandsDist),
				});

				await build(
					mergeConfig(
						{},
						{
							configFile: false,
							plugins: [preact()],
							build: {
								ssr: false,
								outDir: join(viteOutDir, islandsDist),
								emptyOutDir: true,
								rollupOptions: {
									output: {
										format: "esm",
										entryFileNames: "[name].js",
									},
									input: Object.fromEntries(
										[...islReg.islandsByHash.entries()].map(([k, v]) => {
											const key = getIslandName(v.id, k);
											logDebug("rollup input:", {
												key,
												file: join(islandsTmpDir, `${key}.js`),
											});
											return [key, join(islandsTmpDir, `${key}.js`)];
										}),
									),
								},
							},
						},
					),
				);
				logDebug("writeBundle done");
			},
		},
	};
};

function getIslandName(id: string, suffix: string) {
	const baseId = _getIslandName(id);
	return `${baseId}-${String(suffix)}`;
}

function hash(toHash): string {
	let hash = 5381;
	let c: number;

	for (let i = 0; i < toHash.length; i++) {
		c = toHash.charCodeAt(i);
		hash = (hash << 5) + hash + c;
	}

	return String(hash);
}

class IslandRegistry {
	islandsByHash = new Map();
	virtualModulePrefix = "";

	constructor(virtualModulePrefix) {
		this.virtualModulePrefix = virtualModulePrefix;
	}

	register(file, id, code) {
		const hashId = this.getHash(file, id);
		this.islandsByHash.set(hashId, {
			id,
			virtId: `${this.virtualModulePrefix}${hashId}`,
			file: file,
			code,
		});
		return hashId;
	}

	__getResolvedId(id) {
		return `\0${id}`;
	}

	createViteResolveId() {
		return (id) => {
			const normalizedId = id.startsWith("/") ? id.slice(1) : id;
			const entries = [...this.islandsByHash.entries()];
			const exists = entries.find(([d, v]) => {
				const virtId = v.virtId;
				return virtId === normalizedId;
			});

			if (!exists) return null;
			return this.__getResolvedId(normalizedId);
		};
	}

	createViteLoad() {
		return (id) => {
			const entries = [...this.islandsByHash.entries()];
			const normalizedId = id.startsWith("/") ? id.slice(1) : id;

			const exists = entries.find(([d, v]) => {
				const virtId = v.virtId;
				return (
					virtId === normalizedId ||
					this.__getResolvedId(virtId) === normalizedId
				);
			});

			return exists ? exists[1].code : undefined;
		};
	}

	getHash(file, id) {
		return hash(`${file}::${id}`);
	}

	virtualPath(file, id) {
		const hashId = this.getHash(file, id);
		return this.islandsByHash.get(hashId).virtId;
	}

	getCode(file, id) {
		const hashId = this.getHash(file, id);
		return this.islandsByHash.get(hashId)?.code ?? "";
	}
}
