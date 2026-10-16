/**
 * Rewind: go back to an earlier user message, for the conversation and for the files.
 *
 * `/rewind` lists the user messages on the active branch, then rewinds to the one you pick. It runs a
 * dry run first and shows exactly which files would be restored, because a rewind overwrites your working
 * directory. `ctx.navigateTree` moves the conversation; only after you confirm are files written.
 *
 * What can be undone depends on what the session recorded, and that is not uniform:
 * - `edit` stored `oldText` next to `newText`, so it is reversed exactly.
 * - `write` stored only the new content, and `bash` never recorded which files it touched. Neither can be
 *   undone from the session. When this directory is a git repository, use git for those instead.
 *
 * Before any file is written, its current content is copied to `<cwd>/.rewind-backup`.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "../../core/extensions/types.ts";
import { applyRewind, describeOutcome } from "./apply.ts";
import { planRewind, summarizeFiles } from "./plan.ts";

const MAX_PREVIEW_CHARS = 70;

function preview(text: string): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (normalized.length <= MAX_PREVIEW_CHARS) return normalized;
	return `${normalized.slice(0, MAX_PREVIEW_CHARS)}...`;
}

export default function rewindExtension(pi: ExtensionAPI): void {
	pi.registerCommand("rewind", {
		description: "Go back to an earlier message: rewinds the conversation and restores edited files",
		handler: async (args, ctx) => {
			const listOnly = args.trim() === "--list";
			const messages = collectUserMessages(ctx);
			if (messages.length === 0) {
				ctx.ui.notify("No user messages on this branch yet.", "info");
				return;
			}
			if (listOnly) {
				notifyList(ctx, messages);
				return;
			}
			await rewindToSelection(ctx, messages);
		},
	});
}

interface UserNode {
	entryId: string;
	text: string;
}

/** User messages on the active branch, oldest first. */
function collectUserMessages(ctx: ExtensionCommandContext): UserNode[] {
	const nodes: UserNode[] = [];
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type !== "message") continue;
		const message = entry.message as { role?: string; content?: unknown };
		if (message?.role !== "user") continue;
		const text = extractText(message.content);
		if (text) nodes.push({ entryId: entry.id, text });
	}
	return nodes;
}

function extractText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((block): block is { type: string; text: string } => {
			return typeof block === "object" && block !== null && (block as { type?: unknown }).type === "text";
		})
		.map((block) => block.text)
		.join("");
}

function notifyList(ctx: ExtensionCommandContext, messages: readonly UserNode[]): void {
	const lines = messages.map((node, index) => `${index + 1}. ${preview(node.text)}`);
	ctx.ui.notify(`${messages.length} user message(s):\n${lines.join("\n")}`, "info");
}

async function rewindToSelection(ctx: ExtensionCommandContext, messages: readonly UserNode[]): Promise<void> {
	const labels = messages.map((node, index) => `${index + 1}. ${preview(node.text)}`);
	const selected = await ctx.ui.select("Rewind to which message?", labels);
	if (selected === undefined) return;
	const index = labels.indexOf(selected);
	const node = messages[index];
	if (!node) return;

	const entries = ctx.sessionManager.getEntries();
	const plan = planRewind(entries, node.entryId);

	// A dry run first: report, and let the user decide. Nothing is written until they confirm.
	const dryRun = applyRewind(plan, { cwd: ctx.cwd });
	ctx.ui.notify(`Rewind to: ${preview(node.text)}\n${describeOutcome(dryRun)}`, "info");

	if (plan.edits.length === 0 && plan.irreversible.length === 0) {
		ctx.ui.notify("Nothing to undo after that message.", "info");
		await rewindConversation(ctx, node);
		return;
	}

	const reversibleFiles = summarizeFiles(plan.files);
	const confirmed = await ctx.ui.confirm(
		"Apply rewind?",
		`Restoring ${plan.files.length} file(s): ${reversibleFiles}\n` +
			`${plan.irreversible.length} write/bash call(s) cannot be undone; use git for those.\n` +
			"Backups are written to .rewind-backup. Continue?",
	);
	if (!confirmed) {
		ctx.ui.notify("Rewind cancelled. No files were changed.", "info");
		return;
	}

	const applied = applyRewind(plan, { cwd: ctx.cwd, apply: true });
	ctx.ui.notify(describeOutcome(applied), applied.skipped.length > 0 ? "warning" : "info");
	await rewindConversation(ctx, node);
}

/** Move the conversation to the chosen message. The user can decline the optional summary. */
async function rewindConversation(ctx: ExtensionCommandContext, node: UserNode): Promise<void> {
	const result = await ctx.navigateTree(node.entryId, { summarize: false });
	if (result.cancelled) ctx.ui.notify("Rewound files, but the conversation was left where it was.", "warning");
}
