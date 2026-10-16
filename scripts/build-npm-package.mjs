#!/usr/bin/env node
/**
 * Populate the local install package at `npm-package/` from the built coding agent.
 *
 * `npm-package/` is the package users install, but its payload (`dist`, `docs`, `examples`,
 * `schemas`, `CHANGELOG.md`) is build output and is not committed. Nothing else in the repo
 * regenerates it, so without this step it silently goes stale: a package built weeks ago keeps
 * installing while the source moves on.
 *
 * The payload is a copy of `packages/coding-agent/dist`, whose bundle is self-contained. That is why
 * `npm-package/package.json` declares no dependencies: installing `packages/coding-agent` directly
 * would resolve its eleven workspace dependencies from the registry, which is upstream's code rather
 * than this repository's.
 *
 * The ignored payload directories are replaced, so files dropped from the build do not linger.
 * Tracked files in `npm-package/` (package.json, README.md, .gitignore) are never touched.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(repoRoot, "packages", "coding-agent");
const TARGET = join(repoRoot, "npm-package");

/** Build output copied into the install package. `package.json` keeps its own `files` list in sync. */
const PAYLOAD = ["dist", "docs", "examples", "schemas", "CHANGELOG.md"];

function usage() {
	console.log(`Usage: node scripts/build-npm-package.mjs [options]

Copies the built coding agent into npm-package/ so it can be installed locally with
  npm install -g ./npm-package

Options:
  --check   Report what is out of date without writing, and exit 1 when it is
  --help    Show this help
`);
}

const { values } = parseArgs({
	options: {
		check: { type: "boolean", default: false },
		help: { type: "boolean", default: false },
	},
});
if (values.help) {
	usage();
	process.exit(0);
}

/** Every file under `dir`, relative to it, sorted. Empty when `dir` does not exist. */
function listFiles(dir) {
	const found = [];
	const walk = (current) => {
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const path = join(current, entry.name);
			if (entry.isDirectory()) walk(path);
			else if (entry.isFile()) found.push(relative(dir, path).replace(/\\/g, "/"));
		}
	};
	if (existsSync(dir)) walk(dir);
	return found.sort();
}

/**
 * Whether the target already matches the source.
 *
 * Compares relative paths and sizes rather than contents: the payload is megabytes of generated
 * JavaScript, and a size change is enough to catch a stale build for a check that runs often.
 */
function isUpToDate() {
	for (const entry of PAYLOAD) {
		const source = join(SOURCE, entry);
		const target = join(TARGET, entry);
		if (!existsSync(target)) return false;
		if (statSync(source).isFile()) {
			if (statSync(target).size !== statSync(source).size) return false;
			continue;
		}
		const sourceFiles = listFiles(source);
		const targetFiles = listFiles(target);
		if (sourceFiles.length !== targetFiles.length) return false;
		for (const [index, relativePath] of sourceFiles.entries()) {
			if (targetFiles[index] !== relativePath) return false;
			if (statSync(join(target, relativePath)).size !== statSync(join(source, relativePath)).size) return false;
		}
	}
	return true;
}

const missing = PAYLOAD.filter((entry) => !existsSync(join(SOURCE, entry)));
// `dist` is the only entry the build produces; the rest ship with the source tree.
if (missing.includes("dist")) {
	console.error(
		`${relative(repoRoot, join(SOURCE, "dist"))} does not exist. Run "npm run build" first, ` +
			"or use the root script that builds before syncing.",
	);
	process.exit(1);
}
if (missing.length > 0) {
	console.error(`Missing from the coding agent package: ${missing.join(", ")}`);
	process.exit(1);
}

if (values.check) {
	if (isUpToDate()) {
		console.log("npm-package is up to date.");
		process.exit(0);
	}
	console.error("npm-package is out of date. Run: node scripts/build-npm-package.mjs");
	process.exit(1);
}

for (const entry of PAYLOAD) {
	const source = join(SOURCE, entry);
	const target = join(TARGET, entry);
	// Replace rather than merge, so a file removed from the build cannot survive in the install.
	rmSync(target, { recursive: true, force: true });
	mkdirSync(dirname(target), { recursive: true });
	cpSync(source, target, { recursive: true });
}

console.log(`npm-package updated from packages/coding-agent (${PAYLOAD.join(", ")}).`);
console.log(`Install it with: npm install -g ./${relative(repoRoot, TARGET)}`);
