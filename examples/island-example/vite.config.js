import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { islandsPlugin } from "@barelyhuman/vite-islands";

// https://vite.dev/config/
export default defineConfig({
	plugins: [devSSRPlugin(), preact(), islandsPlugin()],
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
