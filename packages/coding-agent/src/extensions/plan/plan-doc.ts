/**
 * Plan document storage.
 *
 * Plan documents are saved as Markdown under `~/pipi/plan/<workspace>/`.
 * The workspace directory is currently the literal placeholder
 * `--工作区example--` (replaced when workspace mapping lands).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const PLAN_WORKSPACE_DIR = "--工作区example--";

export function planDir(): string {
	return join(homedir(), "pipi", "plan", PLAN_WORKSPACE_DIR);
}

/** Save a plan document and return its absolute path. */
export function savePlanDoc(topic: string, markdown: string): string {
	const dir = planDir();
	mkdirSync(dir, { recursive: true });
	const name = `${sanitizeTopic(topic)}-${new Date().toISOString().replace(/[:.]/g, "-")}.md`;
	const path = join(dir, name);
	writeFileSync(path, markdown, "utf-8");
	return path;
}

function sanitizeTopic(topic: string): string {
	const slug = topic
		.toLowerCase()
		.replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40);
	return slug || "plan";
}
