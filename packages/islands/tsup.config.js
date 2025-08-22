import { defineConfig } from "tsup";
import { copyFile, mkdir } from "node:fs/promises";

export default defineConfig({
  entry: ["src/index.ts"],
  bundle: true,
  format: "esm",
  dts: true,
});
