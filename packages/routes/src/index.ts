import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Plugin } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

export type RouteDefinitions<T> = {
  route: string;
  routePath: string;
  module: () => Promise<T>;
};

export default function routes({
  root = "/src/pages",
  id: virtualId = "~routes",
  extensions = ["js", "ts", "tsx", "jsx"],
  /**@deprecated use `baseURL` instead */
  replacer: _replacer = "",
  baseURL = "",
  isExcluded = (filepath: string) => false,
} = {}): Plugin {
  let cfg: { root: string };
  const replacer = baseURL ?? _replacer;
  return {
    name: "barelyhuman-pages",
    enforce: "pre",
    configResolved(_cfg) {
      cfg = _cfg;
    },
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

      const projectRoot = join(cfg.root, root);
      const matches = await readdirRecursive(projectRoot);

      const usableMatches = matches
        .filter((d) => extensions.includes(extname(d)))
        .filter((d) => !isExcluded(d.replace(projectRoot, "")))
        .map((d) => d.replace(projectRoot, ""));

      const normalizedPathsForRegex = usableMatches.map((d) =>
        d.startsWith("/") ? d.slice(1) : d
      );
      const normalizedRootForRegex = !root.endsWith("/") ? `${root}/` : root;

      const globRegex = `${normalizedRootForRegex}(${normalizedPathsForRegex.join(
        "|"
      )})`;
      const code = (
        await readFile(join(__dirname, "./runtime/pages.js"), "utf8")
      )
        .replace(/\#\{__PLUGIN_PAGES_ROOT\}/g, globRegex)
        .replace(/\#\{__PLUGIN_PAGES_ROOT_REGEX\}/, `^${root}`)
        .replace(/\#\{__PLUGIN_PAGES_ROOT_REGEX_REPLACER\}/, replacer);

      return {
        code,
      };
    },
  };
}

async function readdirRecursive(dir) {
  const _dirContents = await readdir(dir);
  const results = [];
  await Promise.all(
    _dirContents.map(async (d) => {
      const withRoot = join(dir, d);
      const _stat = await stat(withRoot);
      if (_stat.isDirectory()) {
        results.push(...(await readdirRecursive(withRoot)));
      } else results.push(withRoot);
    })
  );
  return results;
}
