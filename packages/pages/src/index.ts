import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Plugin } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default function routes({
  root = "/src/pages",
  id: virtualId = "~routes",
  extensions = ["js", "ts", "tsx", "jsx"],
  replacer = "",
} = {}): Plugin {
  return {
    name: "barelyhuman-pages",
    enforce: "pre",
    resolveId(id) {
      if (id !== virtualId) {
        return;
      }
      return `/0${virtualId}`;
    },
    async load(id) {
      if (id !== `/0${virtualId}`) {
        return;
      }

      const extsString = extensions.join(",");
      const code = (
        await readFile(join(__dirname, "./runtime/pages.js"), "utf8")
      )
        .replace(/\#\{__PLUGIN_PAGES_ROOT\}/g, `${root}/**/*.{${extsString}}`)
        .replace(/\#\{__PLUGIN_PAGES_ROOT_REGEX\}/, `^${root}`)
        .replace(/\#\{__PLUGIN_PAGES_ROOT_REGEX_REPLACER\}/, replacer);

      return {
        code,
      };
    },
  };
}
