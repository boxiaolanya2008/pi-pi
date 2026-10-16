/**
 * Applying a rewind plan to the working directory.
 *
 * Two rules, because this overwrites the user's files:
 * 1. Dry-run is the default. Nothing is written until the caller passes `apply: true`.
 * 2. Every file is backed up before it is touched, so a bad plan can be undone by hand.
 *
 * Edits are reversed newest-first and replacements within one call are reversed in place. When the
 * recorded `newText` no longer matches the file (the user edited it by hand since), that replacement is
 * skipped and reported. Nothing is ever guessed or force-written.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { EditChange, RewindPlan } from "./plan.ts";

export interface RewindOutcome {
	/** Files whose content was actually written. */
	changed: string[];
	/** A replacement that could not be applied because the file no longer matched. */
	skipped: { path: string; reason: string }[];
	/** Files this rewind cannot restore, recorded so the user is told. */
	notReversible: RewindPlan["irreversible"];
	/** Directory holding the pre-rewind copies of every changed file. */
	backupDir?: string;
	/** True when nothing was written. */
	dryRun: boolean;
}

export interface ApplyOptions {
	/** Session cwd, used to resolve relative paths. */
	cwd: string;
	/** Where pre-rewind copies go. Defaults to a `.rewind-backup` folder beside the session cwd. */
	backupRoot?: string;
	/** Write the changes. Defaults to false so a dry run cannot damage anything. */
	apply?: boolean;
}

/** One replacement within a call, so partial success can be reported per replacement. */
interface Step {
	entryId: string;
	path: string;
	oldText: string;
	newText: string;
}

/**
 * Expand the plan into concrete replacements, newest first.
 *
 * Within one call the replacements were applied together against the same original content, so they are
 * undone last-to-first to return the file to that state.
 */
function toSteps(edits: readonly EditChange[]): Step[] {
	const steps: Step[] = [];
	for (const change of edits) {
		for (let index = change.edits.length - 1; index >= 0; index--) {
			const replacement = change.edits[index]!;
			steps.push({
				entryId: change.entryId,
				path: change.path,
				oldText: replacement.oldText,
				newText: replacement.newText,
			});
		}
	}
	return steps;
}

function backupPath(backupRoot: string, absolutePath: string, cwd: string, index: number): string {
	const relative = absolutePath.startsWith(cwd) ? absolutePath.slice(cwd.length).replace(/^[\\/]/, "") : absolutePath;
	const safe = relative.replace(/[\\/:*?"<>|]/g, "_");
	return join(backupRoot, `${String(index).padStart(3, "0")}-${safe}`);
}

/**
 * Compute what a rewind would do, and optionally perform it.
 *
 * @param plan Result of `planRewind` for the selected entry.
 */
export function applyRewind(plan: RewindPlan, options: ApplyOptions): RewindOutcome {
	const { cwd, apply = false } = options;
	const backupRoot = options.backupRoot ?? join(cwd, ".rewind-backup");
	const steps = toSteps(plan.edits);
	const changed: string[] = [];
	const skipped: { path: string; reason: string }[] = [];
	// Current content per file, so several replacements against one file compose in memory.
	const contents = new Map<string, string>();

	const readCurrent = (path: string): string | undefined => {
		const cached = contents.get(path);
		if (cached !== undefined) return cached;
		if (!existsSync(path)) return undefined;
		const text = readFileSync(path, "utf-8");
		contents.set(path, text);
		return text;
	};

	for (const step of steps) {
		const absolutePath = join(cwd, step.path);
		const current = readCurrent(absolutePath);
		if (current === undefined) {
			skipped.push({ path: step.path, reason: "file no longer exists" });
			continue;
		}
		const occurrences = countOccurrences(current, step.newText);
		if (occurrences === 0) {
			skipped.push({ path: step.path, reason: "the recorded change is not present in the file" });
			continue;
		}
		if (occurrences > 1) {
			// Ambiguous: picking an occurrence could corrupt a different region.
			skipped.push({ path: step.path, reason: `the recorded change appears ${occurrences} times` });
			continue;
		}
		contents.set(absolutePath, current.replace(step.newText, step.oldText));
		if (!changed.includes(absolutePath)) changed.push(absolutePath);
	}

	const outcome: RewindOutcome = { changed, skipped, notReversible: plan.irreversible, dryRun: !apply };
	if (!apply || changed.length === 0) return outcome;

	for (const [index, absolutePath] of changed.entries()) {
		const content = contents.get(absolutePath);
		if (content === undefined) continue;
		const backupFile = backupPath(backupRoot, absolutePath, cwd, index);
		try {
			if (existsSync(absolutePath)) {
				mkdirSync(dirname(backupFile), { recursive: true });
				writeFileSync(backupFile, readFileSync(absolutePath, "utf-8"), "utf-8");
			}
			writeFileSync(absolutePath, content, "utf-8");
		} catch (error) {
			skipped.push({ path: absolutePath, reason: error instanceof Error ? error.message : String(error) });
		}
	}

	outcome.backupDir = backupRoot;
	return outcome;
}

function countOccurrences(haystack: string, needle: string): number {
	if (needle.length === 0) return 0;
	let count = 0;
	let index = haystack.indexOf(needle);
	while (index !== -1) {
		count++;
		index = haystack.indexOf(needle, index + needle.length);
	}
	return count;
}

/** Human-readable report for the UI. */
export function describeOutcome(outcome: RewindOutcome): string {
	const lines: string[] = [];
	if (outcome.dryRun) {
		lines.push("[dry run] No files were changed. Re-run with apply to write these changes.");
	} else {
		lines.push(
			outcome.changed.length === 0
				? "No files were changed."
				: `Restored ${outcome.changed.length} file(s). Previous copies: ${outcome.backupDir ?? "(none)"}`,
		);
	}
	for (const path of outcome.changed) lines.push(`  would restore / did restore: ${path}`);
	for (const item of outcome.skipped) lines.push(`  skipped ${item.path}: ${item.reason}`);
	if (outcome.notReversible.length > 0) {
		lines.push(
			`${outcome.notReversible.length} write/bash call(s) after that point cannot be undone from the session. ` +
				`Use git if this directory is a repository.`,
		);
	}
	return lines.join("\n");
}
