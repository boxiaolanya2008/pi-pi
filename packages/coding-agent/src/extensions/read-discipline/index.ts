/**
 * Read discipline extension.
 *
 * Why: models imitate reading files with grep/cat, see only matching lines, then
 * edit from partial content and fail or hallucinate. This extension nudges the
 * model back to the `read` tool through three deterministic mechanisms:
 *
 * - Static prompt guidelines and a corrected bash snippet (no time, no state:
 *   the cached prefix stays byte-stable across turns).
 * - A "use read" footer appended to grep/bash content-imitating results. The
 *   footer is a pure function of the result text, so replays are byte-identical
 *   and prompt cache hits are unaffected.
 * - An optional edit gate: by default edits on never-read files pass with a
 *   warning footer; `PI_READ_GATE=1` blocks them until the model reads the file.
 *
 * Configuration (env, per the workspace-guard convention):
 * - `PI_READ_DISCIPLINE=off` disables the whole extension.
 * - `PI_READ_GATE=1` turns the soft edit warning into a hard block.
 */

import type { ImageContent, JsonValue, TextContent } from "@earendil-works/pi-ai";
import { resolve as resolvePath } from "path";
import type { ExtensionAPI, ToolResultEventResult } from "../../core/extensions/types.ts";
import { filesFromGrepOutput, isContentImitatingCommand } from "./classify.ts";

const STATIC_GUIDELINE =
	"grep/cat/head 等只返回片段或匹配行，不是文件内容；edit 前必须先用 read 读取目标文件（大文件用 offset/limit 只读相关区段）。";
const GREP_GUIDELINE = "grep 只返回匹配行；要理解上下文请 read 命中文件的相关区段。";
const BASH_SNIPPET = "Execute shell commands (build, run, git, system tasks; use read/grep tools for files)";
const BASH_FOOTER =
	"[read-discipline] 以上是 shell 片段输出，不是文件完整内容。理解或修改文件前请用 read 工具读取目标文件。";
const EDIT_UNREAD_BLOCK =
	"[read-discipline] 该文件本次会话尚未用 read 读取过。请先 read(path) 读取文件（大文件可 offset/limit 分段），再基于真实内容 edit。";
const EDIT_FAILED_HINT =
	"[read-discipline] edit 失败常因 oldText 不是文件中的精确文本。请先 read(path) 读取目标位置，复制精确原文后重试。";

/** File paths successfully read or written this session (session-scoped, in memory). */
let knownPaths = new Set<string>();

function disciplineEnabled(): boolean {
	const value = process.env.PI_READ_DISCIPLINE?.trim().toLowerCase();
	return !(value === "off" || value === "0" || value === "false" || value === "no");
}

function gateEnabled(): boolean {
	const value = process.env.PI_READ_GATE?.trim().toLowerCase();
	return value === "1" || value === "true" || value === "yes";
}

function resolveKnown(cwd: string, raw: unknown): string | undefined {
	if (typeof raw !== "string" || !raw) return undefined;
	try {
		return resolvePath(cwd, raw);
	} catch {
		return undefined;
	}
}

function textOf(content: (TextContent | ImageContent)[]): string {
	return content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

function appendFooter(
	content: (TextContent | ImageContent)[],
	structuredContent: JsonValue | undefined,
	footer: string,
): ToolResultEventResult {
	// Replacing content without echoing structuredContent would silently drop it.
	return { content: [...content, { type: "text", text: footer }], structuredContent };
}

export default function readDisciplineExtension(pi: ExtensionAPI): void {
	if (!disciplineEnabled()) return;

	pi.on("before_agent_start", async (event) => {
		const options = event.systemPromptOptions;
		if (!options.promptGuidelines.includes(STATIC_GUIDELINE)) options.promptGuidelines.push(STATIC_GUIDELINE);
		// The stock snippet advertises shell grep for files; that is the habit we are correcting.
		options.toolSnippets.bash = BASH_SNIPPET;
		const grepGuidelines = options.toolGuidelines.grep ?? [];
		if (!grepGuidelines.includes(GREP_GUIDELINE)) {
			options.toolGuidelines.grep = [...grepGuidelines, GREP_GUIDELINE];
		}
	});

	pi.on("session_start", async () => {
		knownPaths = new Set();
	});
	pi.on("session_tree", async () => {
		knownPaths = new Set();
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!gateEnabled()) return undefined;
		if (event.toolName !== "edit") return undefined;
		const path = resolveKnown(ctx.cwd || process.cwd(), event.input.path);
		if (!path || knownPaths.has(path)) return undefined;
		return { block: true, reason: EDIT_UNREAD_BLOCK };
	});

	pi.on("tool_result", async (event, ctx) => {
		const cwd = ctx.cwd || process.cwd();
		const input = event.input as Record<string, unknown>;

		// Track successfully read/written files so the gate knows what the model has seen.
		if (!event.isError && (event.toolName === "read" || event.toolName === "write")) {
			const path = resolveKnown(cwd, input.path);
			if (path) knownPaths.add(path);
			return undefined;
		}

		if (event.toolName === "grep" && !event.isError) {
			const text = textOf(event.content);
			if (!text || text === "No matches found") return undefined;
			const files = filesFromGrepOutput(text);
			if (files.length === 0) return undefined;
			const footer = `[read-discipline] grep 只给出匹配行。要理解代码请 read 命中文件的相关区段：${files.join(", ")}`;
			return appendFooter(event.content, event.structuredContent, footer);
		}

		if (event.toolName === "bash" && !event.isError) {
			const command = typeof input.command === "string" ? input.command : "";
			if (!command || !isContentImitatingCommand(command)) return undefined;
			return appendFooter(event.content, event.structuredContent, BASH_FOOTER);
		}

		if (event.toolName === "edit" && event.isError) {
			return appendFooter(event.content, event.structuredContent, EDIT_FAILED_HINT);
		}

		return undefined;
	});
}
