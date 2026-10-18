/**
 * Project map extension.
 *
 * Why: without a structural overview the model explores with repeated ls/grep
 * calls whose results bloat the conversation. This extension computes a compact
 * directory map once per session and injects it as a static prompt section.
 *
 * Determinism: the map is generated at session start, sorted alphabetically
 * (filesystem order varies), and cached in memory for the whole session, so the
 * injected section is byte-identical on every run — prompt cache stays warm.
 * File changes during the session take effect in the next session, by design.
 *
 * Configuration: `PI_PROJECT_MAP=off` disables it.
 */

import type { Dirent } from "fs";
import { readdir } from "fs/promises";
import { join } from "path";
import type { ExtensionAPI } from "../../core/extensions/types.ts";

/** Directories never worth listing; skipped to keep walks cheap and output small. */
const SKIP_DIRS = new Set([
	".git",
	".hg",
	".svn",
	".next",
	".nuxt",
	".turbo",
	".venv",
	"__pycache__",
	"build",
	"coverage",
	"dist",
	"node_modules",
	"out",
	"release",
	"target",
	"vendor",
]);

/** Maximum tree depth from the workspace root. */
const MAX_DEPTH = 2;

/** Maximum map lines; truncation is deterministic (alphabetical cut). */
const MAX_LINES = 150;

function mapEnabled(): boolean {
	const value = process.env.PI_PROJECT_MAP?.trim().toLowerCase();
	return !(value === "off" || value === "0" || value === "false" || value === "no");
}

async function walk(dir: string, prefix: string, depth: number, lines: string[]): Promise<void> {
	if (lines.length >= MAX_LINES || depth > MAX_DEPTH) return;
	let entries: Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return; // Unreadable directory: skip, never fail the session over the map.
	}
	// Codepoint sort: localeCompare varies with ICU locale, breaking byte-stable replays.
	entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
	for (const entry of entries) {
		if (lines.length >= MAX_LINES) return;
		if (entry.isDirectory()) {
			if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
			lines.push(`${prefix}${entry.name}/`);
			await walk(join(dir, entry.name), `${prefix}  `, depth + 1, lines);
		} else {
			lines.push(`${prefix}${entry.name}`);
		}
	}
}

export default function projectMapExtension(pi: ExtensionAPI): void {
	if (!mapEnabled()) return;

	let map: string | undefined;

	pi.on("session_start", async (_event, ctx) => {
		const lines: string[] = [];
		await walk(ctx.cwd, "", 1, lines);
		map = lines.length > 0 ? lines.join("\n") : undefined;
	});

	pi.on("before_agent_start", async (event) => {
		if (map) event.systemPromptOptions.sections.project_map = map;
	});
}
