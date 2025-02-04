import { defineConfig } from "tsup";
import { copyFile, mkdir } from "node:fs/promises";

export default defineConfig({
  entry: ["src/index.ts"],
  bundle: true,
  format: "esm",
  dts: true,
  async onSuccess() {
    await mkdir("./dist/runtime", { recursive: true });
    await copyFile("./src/runtime/pages.js", "./dist/runtime/pages.js");
  },
});
