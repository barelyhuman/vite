import { islandsPlugin } from "@barelyhuman/vite-islands";
import {
	findIslands,
	getIslandName,
	getServerTemplatePlaceholder,
	injectIslandAST,
	isFunctionIsland,
	readSourceFile,
} from "@dumbjs/preland";
import { addImportToAST, codeFromAST } from "@dumbjs/preland/ast";
import preact from "@preact/preset-vite";
import { build } from "esbuild";
import path from "node:path";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		devSSRPlugin(),
		preact(),
		islandsPlugin({
			// debug: true,
			isValidFile: (id) => /\.(ts|js)x?$/.test(id),
			findIslands: async (code, id) => {
				const result = readSourceFile(id);
				return findIslands(result, {
					isFunctionIsland: (ast, options) =>
						isFunctionIsland(ast, {
							...options,
							transpiledIdentifiers: options.transpiledIdentifiers.concat([
								"_jsxDEV",
							]),
						}),
				});
			},
			transformServerCode(code, file, islands, ctx) {
				for (const d of islands) {
					injectIslandAST(d.ast, d, (name) => {
						const counter = ctx.registry.getId(file, d.id);
						const islandName = `${getIslandName(name)}${counter > 0 ? `-${counter}` : ""}`;

						const code = `function Island${name}(props) {
  return h(
    Fragment,
		{},
    h(
      "${islandName}",
      {
        "data-props": JSON.stringify(props),
      },
      h(${name},props),
        h("script", {
					"data-island": "script",
          src: "${getServerTemplatePlaceholder(name)}",
          type: "module",
          defer: true,
        }),
    ),
  );
}

export { Island${name} as Counter };
`;

						return code;
					});
				}

				const addImport = addImportToAST(islands[0].ast);
				addImport("h", "preact", { named: true });
				addImport("Fragment", "preact", { named: true });

				let serverCode = codeFromAST(islands[0].ast);

				for (const island of islands) {
					const possibleOutputPath = ctx.registry.getPath(file, island.id);
					if (possibleOutputPath.isVirtual) {
						serverCode = serverCode.replace(
							getServerTemplatePlaceholder(island.id),
							`/${possibleOutputPath.path}`,
						);
					} else {
						const islandPath = `/islands/${possibleOutputPath}`;
						serverCode = serverCode.replace(
							getServerTemplatePlaceholder(island.id),
							islandPath,
						);
					}
				}

				return serverCode;
			},
			generateClientCode(island, file, ctx) {
				const counter = ctx.registry.getId(file, island.id);
				const islandName = `${getIslandName(island.id)}${counter > 0 ? `-${counter}` : ""}`;
				return /*JAVASCRIPT*/ `import { h, render } from "preact"
				
const existing = customElements.get("${islandName}")
if(typeof existing === "undefined"){
	customElements.define("${islandName}",
	class Island${island.id} extends HTMLElement {
		constructor(){
			super();
		}
    
		async connectedCallback() {
				const c = await import("${file}");
				const usableComponent = c["${island.id}"]
				const props = JSON.parse(this.dataset.props  || '{}');
				this.baseProps = props
				this.component = usableComponent
				this.renderOnView({threshold:0.2})              
		}
    
		renderOnView({threshold} = {}){
			const options = {
				root: null,
				threshold,
			};
	
			const self = this;
	
			const callback = function(entries, observer) {
					entries.forEach((entry) => {
					if(!entry.isIntersecting) return
					self.renderIsland()
					});
			}
	
			let observer = new IntersectionObserver(callback, options);
			observer.observe(this);
		}
    
		renderIsland(){
			render(h(this.component, {
				...this.baseProps,
			}), this)

			while (this.childNodes.length != 0) {
    			this.parentNode.insertBefore(this.childNodes[0],this);
  		}

			this.remove()
		}
	})
}
				`;
			},
			async afterBuild(ctx) {
				const entries = Object.fromEntries(
					[...ctx.registry.islandsByHash.entries()].map(([k, v]) => {
						const key = `island-${v.id}-${k}`;
						return [key, v.outputPath];
					}),
				);
				console.log("\n[islands] building `.islands` for production");
				await build({
					logLevel: "info",
					entryPoints: entries,
					bundle: true,
					jsx: "automatic",
					loader: {
						".js": "jsx",
					},
					jsxImportSource: "preact",
					outdir: path.join(ctx.dirs.viteOutDir, "islands"),
					plugins: [
						{
							name: "vite-like-resolver",
							setup(build) {
								build.onResolve({ filter: /\.(ts|js)x?$/ }, (id) => {
									if (id.path.startsWith("/src/")) {
										const fullPath = path.resolve(
											"./src",
											id.path.slice("/src/".length),
										);
										return {
											path: fullPath,
										};
									}
									return;
								});
							},
						},
					],
				});
			},
		}),
	],
});

/**
 * @returns {import("vite").Plugin}
 */
function devSSRPlugin() {
	return {
		name: "dev-ssr-server",
		enforce: "post",
		config() {
			return {
				appType: "custom",
				build: {
					ssr: true,
					manifest: "manifest.json",
					ssrManifest: "ssr.manifest.json",
					rollupOptions: {
						input: {
							index: "virtual:server",
						},
					},
				},
			};
		},
		resolveId(id) {
			if (id === "virtual:server" || id === "/virtual:server") {
				return "\0virtual:server";
			}
		},
		load(id) {
			if (id === "\0virtual:server") {
				return `
          import { Main } from '/src/main';
          console.log(Main)
        `;
			}
		},
		configureServer(server) {
			return () => {
				server.middlewares.use(async (req, res, next) => {
					try {
						const AppModule = await server.ssrLoadModule("/src/main.jsx");
						res.setHeader("Content-Type", "text/html");
						res.write(renderToString(h(AppModule.Main, {})));
						return res.end();
					} catch (err) {
						next(err);
					}
				});
			};
		},
	};
}
