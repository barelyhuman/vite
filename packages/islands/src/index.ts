import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

export interface Node<ASTNodeType> {
	id: string;
	ast: ASTNodeType;
}

type InterfaceObject<ASTNodeType> = {
	file: string;
	hash: string;
	node: Node<ASTNodeType>;
	outFile: string;
};

export type Options = {
	islandsTmpDir?: string;
	isValidFile: (file: string) => boolean;
	findIslands: <T>(code: string, id: string) => Node<T>[] | Promise<Node<T>[]>;
	generateClientCode: <T>(
		island: Node<T>,
		file: string,
		context: {
			registry: IslandRegistry;
		},
	) => string | Promise<string>;
	transformServerCode: <T>(
		code: string,
		file: string,
		islands: Node<T>[],
		context: {
			registry: IslandRegistry;
			paths: Record<string, InterfaceObject<T> | InterfaceObject<T>[]>;
		},
	) => string | Promise<string>;
	afterBuild?: (context: {
		dirs: {
			viteOutDir: string;
		};
		registry: IslandRegistry;
	}) => Promise<void>;
	virtualModulePrefix?: string;
	debug?: boolean;
};

export const islandsPlugin = (options: Options): Plugin => {
	let isBuild = false;
	let viteRootDir: string;
	let viteOutDir: string;
	let islandsTmpDir: string;
	const virtualModulePrefix = options?.virtualModulePrefix || "virtual:island-";
	const debug = !!options?.debug;

	const islReg = new IslandRegistry(virtualModulePrefix, isBuild);

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
			viteOutDir = cfg.build.outDir || "dist";
			islandsTmpDir = join(viteRootDir, options?.islandsTmpDir || ".islands");
			logDebug("config:", { viteRootDir, isBuild, islandsTmpDir });
		},
		load: islReg.createViteLoad(),
		resolveId: islReg.createViteResolveId(),
		async transform(sourceCode, id, viteEnv) {
			if (!viteEnv?.ssr) return;
			if (!options.isValidFile(id)) return;
			logDebug("working on file:", { id });

			const islands = await options.findIslands(sourceCode, id);
			logDebug("found islands:", { id, count: islands.length, islands });
			if (!islands.length) return;

			const hashableFilePath = id.replace(viteRootDir, "");
			const islandOutPaths: Record<
				string,
				InterfaceObject<unknown> | InterfaceObject<unknown>[]
			> = {
				byHash: {} as InterfaceObject<unknown>,
				byNodeId: [] as InterfaceObject<unknown>[],
				byFile: {} as InterfaceObject<unknown>,
			};

			for (const node of islands) {
				const clientCode = await options.generateClientCode(
					node,
					hashableFilePath,
					{
						registry: islReg,
					},
				);
				const hashedId = islReg.getHash(hashableFilePath, node.id);
				islReg.register(hashableFilePath, node.id, clientCode);

				mkdirSync(islandsTmpDir, { recursive: true });
				const islandTempFileOutPath = join(
					islandsTmpDir,
					`island-${node.id}-${hashedId}.js`,
				);

				islReg.setOutpath(hashedId, islandTempFileOutPath);

				writeFileSync(islandTempFileOutPath, clientCode, "utf8");
				const interfaceObject = {
					file: hashableFilePath,
					hash: hashedId,
					node: node,
					outFile: islandTempFileOutPath,
				};

				islandOutPaths.byFile[hashableFilePath] = interfaceObject;
				islandOutPaths.byHash[hashedId] = interfaceObject;

				// Same node.id can exist more than once
				islandOutPaths.byNodeId[node.id] ||= [];
				islandOutPaths.byNodeId[node.id].push({ interfaceObject });

				logDebug("island client code written:", {
					nodeId: node.id,
					file: islandTempFileOutPath,
				});
			}

			const serverTemplateCode = await options.transformServerCode(
				sourceCode,
				hashableFilePath,
				islands,
				{
					paths: islandOutPaths,
					registry: islReg,
				},
			);

			logDebug("transform done:", { id });
			return {
				code: serverTemplateCode,
			};
		},
		writeBundle: {
			sequential: true,
			handler: () => {
				if (options.afterBuild) {
					process.nextTick(() => {
						options.afterBuild?.({
							dirs: {
								viteOutDir,
							},
							registry: islReg,
						});
					});
				}
			},
		},
	};
};

function hash(toHash): string {
	let hash = 5381;
	let c: number;

	for (let i = 0; i < toHash.length; i++) {
		c = toHash.charCodeAt(i);
		hash = (hash << 5) + hash + c;
	}

	return String(hash);
}

export interface RegistryItem {
	id: string;
	virtId: string;
	file: string;
	code: string;
	outputPath?: string;
}

class IslandRegistry {
	islandsByHash = new Map<string, RegistryItem>();
	virtualModulePrefix = "";
	counters = [];
	buildMode = false;

	constructor(virtualModulePrefix, buildMode) {
		this.virtualModulePrefix = virtualModulePrefix;
		this.buildMode = buildMode;
	}

	getId(file, id, findAt = 0) {
		if (!this.counters[findAt]) {
			this.counters[findAt] = [];
		}

		const nameMatch = this.counters[findAt].findIndex((d) => d.id === id);

		if (nameMatch > -1) {
			const matchedSet = this.counters[findAt][nameMatch];
			if (matchedSet.file === file) {
				// same file, same name
				return findAt;
			}
			// diff file, same name
			return this.getId(file, id, findAt + 1);
		}

		// name hasn't matched, push on findAt
		this.counters[findAt].push({
			id: id,
			file: file,
		});

		return findAt;
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

	setOutpath(hashId, output) {
		const exists = this.islandsByHash.has(hashId);
		if (!exists) return;
		this.islandsByHash.set(hashId, {
			...this.islandsByHash.get(hashId),
			outputPath: output,
		});
	}

	getHash(file, id) {
		return hash(`${file}::${id}`);
	}

	getPath(file, id) {
		const hashId = this.getHash(file, id);
		const island = this.islandsByHash.get(hashId);
		return {
			path: this.buildMode
				? `${island.id}-${hashId}.js`
				: this.virtualPath(file, id),
			isVirtual: !this.buildMode,
		};
	}

	virtualPath(file, id) {
		const hashId = this.getHash(file, id);
		if (!this.islandsByHash.has(hashId)) {
			throw new Error(
				`Island for file:${file} and component:${id} have not been registered`,
			);
		}
		return this.islandsByHash.get(hashId).virtId;
	}
}
