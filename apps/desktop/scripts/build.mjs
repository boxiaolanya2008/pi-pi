/**
 * Build the desktop shell.
 *
 * Three separate bundles, because the three targets have different rules:
 * - main: ES module, `electron` left external (the runtime provides it).
 * - preload: CommonJS, because a sandboxed preload cannot be an ES module.
 * - renderer: ES module loaded by the page, with `electron` never referenced.
 *
 * Assets are copied rather than bundled so the CSP can allow `'self'` only: nothing is inlined.
 */

import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, "dist");

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "renderer"), { recursive: true });

const common = {
	bundle: true,
	platform: "node",
	target: "es2022",
	sourcemap: true,
	logLevel: "info",
};

await build({
	...common,
	entryPoints: [join(root, "src", "main.ts")],
	outfile: join(out, "main.mjs"),
	format: "esm",
	external: ["electron"],
	// The SDK resolves its own assets at runtime; bundling it would break those lookups.
	packages: "external",
});

await build({
	...common,
	entryPoints: [join(root, "src", "preload.ts")],
	outfile: join(out, "preload.cjs"),
	format: "cjs",
	external: ["electron"],
	packages: "external",
});

await build({
	...common,
	platform: "browser",
	entryPoints: [join(root, "src", "renderer", "renderer.ts")],
	outfile: join(out, "renderer", "renderer.js"),
	format: "esm",
});

cpSync(join(root, "src", "renderer", "index.html"), join(out, "renderer", "index.html"));
cpSync(join(root, "src", "renderer", "styles.css"), join(out, "renderer", "styles.css"));

console.log("desktop shell built into dist/");
