/**
 * Reverie memory extension.
 *
 * Maintains a single append-only user-profile file at `~/pipi/reverie.md`. The
 * file is injected once per session as a system prompt section (static for the
 * whole session, so prompt-prefix caching is never invalidated), together with
 * a standing reminder that makes the model call the `reverie` tool after each
 * turn to append what it learned about the user. Updated snapshots load with
 * the next session.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import type { ExtensionAPI } from "../../core/extensions/types.ts";

const ReverieParams = Type.Object({
	description: Type.String({
		description: "One sentence describing what kind of person the user is, learned from this conversation",
	}),
});

const REVERIE_DIR = join(homedir(), "pipi");
export const REVERIE_PATH = join(REVERIE_DIR, "reverie.md");
const REVERIE_HEADER = "# Reverie — 用户记忆\n";
/** Injection cap: only the tail of the file goes into the prompt. */
const SNAPSHOT_TAIL_CHARS = 4000;
const SECTION_NAME = "reverie";

/** Ensure the file exists (creating dir and file on first use) and return its content. */
export function readOrCreateReverie(path: string = REVERIE_PATH): string {
	if (!existsSync(path)) {
		mkdirSync(REVERIE_DIR, { recursive: true });
		writeFileHeader(path);
		return REVERIE_HEADER;
	}
	return readFileSync(path, "utf-8");
}

function writeFileHeader(path: string): void {
	mkdirSync(dirname(path), { recursive: true });
	if (!existsSync(path)) appendFileSync(path, REVERIE_HEADER, "utf-8");
}

/** Append one dated user description line. Never overwrites history. */
export function appendUserDescription(description: string, path: string = REVERIE_PATH, now = new Date()): void {
	const trimmed = description.trim();
	if (!trimmed) return;
	writeFileHeader(path);
	const stamp = now.toISOString().slice(0, 16).replace("T", " ");
	appendFileSync(path, `- [${stamp}] ${trimmed}\n`, "utf-8");
}

/** Tail slice of the file used for prompt injection. */
export function snapshotForPrompt(content: string): string {
	const trimmed = content.trimEnd();
	return trimmed.length <= SNAPSHOT_TAIL_CHARS ? trimmed : trimmed.slice(-SNAPSHOT_TAIL_CHARS);
}

function buildSectionContent(snapshot: string): string {
	return `## 用户记忆（reverie）

下面是历史对话中积累的用户画像（~/pipi/reverie.md），用于理解用户是什么样的人、偏好什么、如何交流：

${snapshot}

记得修改记忆文件：本轮对话若让你了解到用户的任何新特征（身份、偏好、习惯、目标、背景、表达方式），必须在回复结束前调用 reverie 工具追加一条一句话描述；没有任何新信息则不要调用。`;
}

export default function reverieExtension(pi: ExtensionAPI): void {
	let snapshot = "";
	let sectionApplied = false;

	const loadSnapshot = () => {
		snapshot = snapshotForPrompt(readOrCreateReverie());
	};

	pi.on("session_start", async () => {
		loadSnapshot();
		sectionApplied = false;
	});
	pi.on("session_tree", async () => {
		// Re-read on resume/branch switch, but keep an already-applied section to
		// preserve prompt-prefix caching within the running session.
		snapshot = snapshotForPrompt(readOrCreateReverie());
	});

	pi.on("before_agent_start", async (event) => {
		if (sectionApplied || event.messageType !== "user") return;
		if (!snapshot) loadSnapshot();
		event.systemPromptOptions.sections[SECTION_NAME] = buildSectionContent(snapshot);
		sectionApplied = true;
	});

	pi.registerTool({
		name: "reverie",
		label: "Reverie",
		description:
			"Append a one-sentence description of the user (identity, preference, habit, goal, or communication style observed in this conversation) to ~/pipi/reverie.md",
		parameters: ReverieParams,
		async execute(_toolCallId, params) {
			appendUserDescription(params.description);
			return {
				content: [{ type: "text", text: "Recorded." }],
				details: {},
			};
		},
		renderCall(args, theme) {
			const text =
				theme.fg("toolTitle", theme.bold("reverie ")) +
				theme.fg("muted", String(args.description ?? "").slice(0, 80));
			return new Text(text, 0, 0);
		},
		renderResult(result, _options, theme) {
			const text = result.content[0];
			return new Text(theme.fg("success", "✓ ") + theme.fg("muted", text?.type === "text" ? text.text : ""), 0, 0);
		},
	});
}
