import { renderToString } from "preact-render-to-string";
import { h } from "preact";

/**
 * @returns {import("vite").Plugin}
 */
export const devSSRPlugin = () => {
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
					import { App } from '/src/main';
					console.log(App)
				`;
			}
		},
		configureServer(server) {
			return () => {
				server.middlewares.use(async (req, res, next) => {
					try {
						const AppModule = await server.ssrLoadModule("/src/main.jsx");
						res.setHeader("Content-Type", "text/html");
						res.write(renderToString(h(AppModule.App, {})));
						return res.end();
					} catch (err) {
						next(err);
					}
				});
			};
		},
	};
};
