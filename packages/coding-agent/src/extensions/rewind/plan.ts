/**
 * Rewind planning: what changed between a session entry and the current leaf, and whether each change
 * can be undone.
 *
 * Pure reading, no writes. The rewind itself lives in `apply.ts`.
 *
 * Reversibility is per tool, and it is not uniform:
 * - `edit` records `oldText` beside `newText`, so it can be reversed exactly.
 * - `write` records only the new content, so the previous version was never stored.
 * - `bash` records the command and its output, never which files it touched.
 *
 * `write` and `bash` therefore cannot be undone from the session alone. When the working directory is a
 * git repository with changes, the caller can fall back to a git-level revert, which does cover them.
 */

import type { SessionEntry } from "../../core/session-manager.ts";

/** One `edit` replacement, kept in the shape the tool was called with. */
export interface EditReplacement {
	oldText: string;
	newText: string;
}

/** One reversible edit call against a single file. */
export interface EditChange {
	entryId: string;
	/** Path as the tool received it, already resolved against the session cwd by the caller. */
	path: string;
	edits: EditReplacement[];
}

/** A change that cannot be reversed from the session, recorded so the user is told about it. */
export interface IrreversibleChange {
	entryId: string;
	tool: "write" | "bash";
	path?: string;
	/** The command, for bash. */
	command?: string;
}

/** Everything that happened after `fromEntryId` up to the current leaf. */
export interface RewindPlan {
	fromEntryId: string;
	/** Reversible edit calls, newest first, so applying them in order walks history backwards. */
	edits: EditChange[];
	/** write and bash calls, which this planner cannot reverse. */
	irreversible: IrreversibleChange[];
	/** Distinct paths touched by reversible edits. */
	files: string[];
}

interface ToolCallBlock {
	type: "toolCall";
	id?: string;
	name?: string;
	arguments?: Record<string, unknown>;
}

function toolCallsOf(entry: SessionEntry): ToolCallBlock[] {
	if (entry.type !== "message") return [];
	const message = entry.message as { role?: string; content?: unknown };
	if (message?.role !== "assistant" || !Array.isArray(message.content)) return [];
	return message.content.filter(
		(block): block is ToolCallBlock => typeof block === "object" && block !== null && block.type === "toolCall",
	);
}

function asPath(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asCommand(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Parse one tool call's arguments, tolerating the JSON-string form providers may emit. */
function parseArguments(raw: unknown): Record<string, unknown> {
	if (typeof raw === "string") {
		try {
			const parsed = JSON.parse(raw);
			return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
		} catch {
			return {};
		}
	}
	return typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
}

function parseEditReplacements(value: unknown): EditReplacement[] {
	if (!Array.isArray(value)) return [];
	const replacements: EditReplacement[] = [];
	for (const item of value) {
		if (typeof item !== "object" || item === null) continue;
		const { oldText, newText } = item as { oldText?: unknown; newText?: unknown };
		// A replacement missing either side cannot be inverted, so it is dropped here and the caller
		// reports the file as only partially reversible.
		if (typeof oldText !== "string" || typeof newText !== "string") continue;
		replacements.push({ oldText, newText });
	}
	return replacements;
}

/**
 * Collect the changes made after `fromEntryId`.
 *
 * Only entries on the active branch after that entry are considered, so a rewind never touches work from
 * an abandoned branch. `fromEntryId` itself is the target state and is excluded.
 */
export function planRewind(entries: readonly SessionEntry[], fromEntryId: string): RewindPlan {
	const startIndex = entries.findIndex((entry) => entry.id === fromEntryId);
	const plan: RewindPlan = { fromEntryId, edits: [], irreversible: [], files: [] };
	if (startIndex < 0) return plan;

	// Walk backwards so the newest change lands first; applying in array order then undoes latest-first.
	for (let index = entries.length - 1; index > startIndex; index--) {
		const entry = entries[index]!;
		for (const call of toolCallsOf(entry)) {
			const args = parseArguments(call.arguments);
			switch (call.name) {
				case "edit": {
					const path = asPath(args.path);
					const edits = parseEditReplacements(args.edits);
					if (path && edits.length > 0) {
						plan.edits.push({ entryId: entry.id, path, edits });
					}
					break;
				}
				case "write":
					plan.irreversible.push({
						entryId: entry.id,
						tool: "write",
						...(asPath(args.path) ? { path: asPath(args.path)! } : {}),
					});
					break;
				case "bash":
					plan.irreversible.push({
						entryId: entry.id,
						tool: "bash",
						...(asCommand(args.command) ? { command: asCommand(args.command)! } : {}),
					});
					break;
				default:
					break;
			}
		}
	}

	plan.files = [...new Set(plan.edits.map((change) => change.path))];
	return plan;
}

/** One-line summary of a path set, capped so a long list does not flood the UI. */
export function summarizeFiles(files: readonly string[], limit = 10): string {
	if (files.length === 0) return "none";
	if (files.length <= limit) return files.join(", ");
	return `${files.slice(0, limit).join(", ")} (+${files.length - limit} more)`;
}
