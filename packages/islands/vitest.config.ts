import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		deps: {
			optimizer: {
				ssr: {
					include: ["vite-test-utils"],
				},
			},
		},
		globals: true,
		environment: "node",
	},
});
