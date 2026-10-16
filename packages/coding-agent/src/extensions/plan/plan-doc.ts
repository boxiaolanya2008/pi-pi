/**
 * Plan document storage.
 *
 * Plan documents are saved as Markdown under `%APPDATA%/.pipi/plan/<workspace>/`
 * (XDG config dir on non-Windows). The workspace directory is currently the
 * literal placeholder `--工作区example--` (replaced when workspace mapping lands).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PLAN_DIR } from "../storage-paths.ts";

/** Save a plan document and return its absolute path. */
export function savePlanDoc(topic: string, markdown: string): string {
	mkdirSync(PLAN_DIR, { recursive: true });
	const name = `${sanitizeTopic(topic)}-${new Date().toISOString().replace(/[:.]/g, "-")}.md`;
	const path = join(PLAN_DIR, name);
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
