/**
 * Rewind planning and application.
 *
 * Every apply test runs inside a fresh temporary directory, so a mistake here cannot touch a real
 * workspace. The properties that matter: dry-run writes nothing, edits are reversed newest-first, and a
 * file the user changed by hand is skipped rather than overwritten.
 */

import assert from "node:assert";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { SessionEntry } from "../src/core/session-manager.ts";
import { applyRewind, describeOutcome } from "../src/extensions/rewind/apply.ts";
import { planRewind, summarizeFiles } from "../src/extensions/rewind/plan.ts";

interface EntryInit {
	id: string;
	role: "user" | "assistant";
	toolCalls?: { name: string; args: Record<string, unknown> }[];
}

function entry({ id, role, toolCalls }: EntryInit): SessionEntry {
	const content =
		role === "user"
			? [{ type: "text", text: `message ${id}` }]
			: (toolCalls ?? []).map((call, index) => ({
					type: "toolCall",
					id: `${id}-${index}`,
					name: call.name,
					arguments: call.args,
				}));
	return {
		type: "message",
		id,
		parentId: null,
		timestamp: "2026-01-01T00:00:00.000Z",
		message: { role, content, timestamp: 0 },
	} as unknown as SessionEntry;
}

function editEntry(id: string, path: string, edits: { oldText: string; newText: string }[]): SessionEntry {
	return entry({ id, role: "assistant", toolCalls: [{ name: "edit", args: { path, edits } }] });
}

function withTempDir<T>(run: (dir: string) => T): T {
	const dir = mkdtempSync(join(tmpdir(), "pi-rewind-test-"));
	try {
		return run(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

describe("planRewind", () => {
	it("collects only edits made after the target entry", () => {
		const entries = [
			entry({ id: "u1", role: "user" }),
			editEntry("a1", "a.ts", [{ oldText: "one", newText: "two" }]),
			editEntry("a2", "b.ts", [{ oldText: "three", newText: "four" }]),
		];

		const plan = planRewind(entries, "u1");

		assert.deepStrictEqual(
			plan.edits.map((change) => change.path),
			["b.ts", "a.ts"],
			"newest change must come first so applying in order undoes latest-first",
		);
		assert.deepStrictEqual(plan.files, ["b.ts", "a.ts"]);
	});

	it("excludes the target entry itself and anything before it", () => {
		const entries = [
			editEntry("a0", "before.ts", [{ oldText: "x", newText: "y" }]),
			entry({ id: "u1", role: "user" }),
			editEntry("a1", "after.ts", [{ oldText: "p", newText: "q" }]),
		];

		const plan = planRewind(entries, "u1");

		assert.deepStrictEqual(
			plan.files,
			["after.ts"],
			"the target entry is the state to return to, so its own edits must not be reversed",
		);
	});

	it("returns an empty plan for an unknown entry", () => {
		const plan = planRewind([entry({ id: "u1", role: "user" })], "nope");
		assert.deepStrictEqual(plan.edits, []);
		assert.deepStrictEqual(plan.files, []);
	});

	it("records write and bash calls as irreversible", () => {
		const entries = [
			entry({ id: "u1", role: "user" }),
			entry({
				id: "a1",
				role: "assistant",
				toolCalls: [
					{ name: "write", args: { path: "new.ts", content: "hello" } },
					{ name: "bash", args: { command: "rm -rf build" } },
					{ name: "read", args: { path: "ignored.ts" } },
				],
			}),
		];

		const plan = planRewind(entries, "u1");

		assert.deepStrictEqual(plan.edits, [], "write and bash must not be treated as reversible");
		assert.deepStrictEqual(
			plan.irreversible.map((item) => item.tool),
			["write", "bash"],
			"tool calls within one message keep their source order",
		);
		assert.deepStrictEqual(
			plan.irreversible.map((item) => item.path),
			["new.ts", undefined],
		);
		assert.deepStrictEqual(
			plan.irreversible.map((item) => item.command),
			[undefined, "rm -rf build"],
		);
	});

	it("drops replacements missing either side, since they cannot be inverted", () => {
		const entries = [
			entry({ id: "u1", role: "user" }),
			entry({
				id: "a1",
				role: "assistant",
				toolCalls: [
					{
						name: "edit",
						args: {
							path: "a.ts",
							edits: [{ oldText: "kept" }, { newText: "dropped" }, { oldText: "o", newText: "n" }],
						},
					},
				],
			}),
		];

		const plan = planRewind(entries, "u1");

		assert.strictEqual(plan.edits.length, 1);
		assert.deepStrictEqual(plan.edits[0]!.edits, [{ oldText: "o", newText: "n" }]);
	});

	it("parses tool arguments given as a JSON string", () => {
		const entries = [
			entry({ id: "u1", role: "user" }),
			{
				type: "message",
				id: "a1",
				parentId: null,
				timestamp: "2026-01-01T00:00:00.000Z",
				message: {
					role: "assistant",
					timestamp: 0,
					content: [
						{
							type: "toolCall",
							id: "c1",
							name: "edit",
							arguments: JSON.stringify({ path: "s.ts", edits: [{ oldText: "a", newText: "b" }] }),
						},
					],
				},
			} as unknown as SessionEntry,
		];

		assert.deepStrictEqual(planRewind(entries, "u1").files, ["s.ts"]);
	});
});

describe("summarizeFiles", () => {
	it("reports none when empty", () => {
		assert.strictEqual(summarizeFiles([]), "none");
	});

	it("caps a long list", () => {
		const summary = summarizeFiles(
			Array.from({ length: 15 }, (_, i) => `f${i}.ts`),
			10,
		);
		assert.match(summary, /\(\+5 more\)$/);
	});
});

describe("applyRewind", () => {
	it("writes nothing during a dry run", () => {
		withTempDir((dir) => {
			const file = join(dir, "a.ts");
			writeFileSync(file, "changed", "utf-8");

			const outcome = applyRewind(
				{
					fromEntryId: "u1",
					edits: [{ entryId: "a1", path: "a.ts", edits: [{ oldText: "original", newText: "changed" }] }],
					irreversible: [],
					files: ["a.ts"],
				},
				{ cwd: dir },
			);

			assert.strictEqual(outcome.dryRun, true);
			assert.deepStrictEqual(outcome.changed, [join(dir, "a.ts")]);
			assert.strictEqual(readFileSync(file, "utf-8"), "changed", "dry run must not touch the file");
			assert.strictEqual(existsSync(join(dir, ".rewind-backup")), false, "dry run must not back up");
		});
	});

	it("restores the original content and backs up the current one", () => {
		withTempDir((dir) => {
			const file = join(dir, "a.ts");
			writeFileSync(file, "changed", "utf-8");

			const outcome = applyRewind(
				{
					fromEntryId: "u1",
					edits: [{ entryId: "a1", path: "a.ts", edits: [{ oldText: "original", newText: "changed" }] }],
					irreversible: [],
					files: ["a.ts"],
				},
				{ cwd: dir, apply: true },
			);

			assert.strictEqual(outcome.dryRun, false);
			assert.strictEqual(readFileSync(file, "utf-8"), "original");
			const backupDir = outcome.backupDir!;
			assert.strictEqual(existsSync(backupDir), true, "a backup must exist after a real rewind");
			const backups = readBackupContents(backupDir);
			assert.deepStrictEqual(backups, ["changed"], "the backup must hold the pre-rewind content");
		});
	});

	it("reverses repeated edits to the same file newest-first", () => {
		withTempDir((dir) => {
			const file = join(dir, "a.ts");
			// Sequence: original -> v1 -> v2. Collected newest-first, so undoing in order returns original.
			writeFileSync(file, "v2", "utf-8");

			const outcome = applyRewind(
				{
					fromEntryId: "u1",
					edits: [
						{ entryId: "a2", path: "a.ts", edits: [{ oldText: "v1", newText: "v2" }] },
						{ entryId: "a1", path: "a.ts", edits: [{ oldText: "original", newText: "v1" }] },
					],
					irreversible: [],
					files: ["a.ts"],
				},
				{ cwd: dir, apply: true },
			);

			assert.strictEqual(readFileSync(file, "utf-8"), "original");
			assert.deepStrictEqual(outcome.skipped, []);
		});
	});

	it("reverses replacements within one call last-to-first", () => {
		withTempDir((dir) => {
			const file = join(dir, "a.ts");
			writeFileSync(file, "head NEW2 NEW1 tail", "utf-8");

			applyRewind(
				{
					fromEntryId: "u1",
					// Applied as NEW1 then NEW2 against the same original content.
					edits: [
						{
							entryId: "a1",
							path: "a.ts",
							edits: [
								{ oldText: "OLD1", newText: "NEW1" },
								{ oldText: "OLD2", newText: "NEW2" },
							],
						},
					],
					irreversible: [],
					files: ["a.ts"],
				},
				{ cwd: dir, apply: true },
			);

			assert.strictEqual(readFileSync(file, "utf-8"), "head OLD2 OLD1 tail");
		});
	});

	it("skips a file the user changed by hand instead of overwriting it", () => {
		withTempDir((dir) => {
			const file = join(dir, "a.ts");
			writeFileSync(file, "hand-edited by a human", "utf-8");

			const outcome = applyRewind(
				{
					fromEntryId: "u1",
					edits: [{ entryId: "a1", path: "a.ts", edits: [{ oldText: "original", newText: "changed" }] }],
					irreversible: [],
					files: ["a.ts"],
				},
				{ cwd: dir, apply: true },
			);

			assert.strictEqual(readFileSync(file, "utf-8"), "hand-edited by a human", "must not be overwritten");
			assert.strictEqual(outcome.changed.length, 0);
			assert.strictEqual(outcome.skipped.length, 1);
			assert.match(outcome.skipped[0]!.reason, /not present/);
		});
	});

	it("skips when the recorded change appears more than once", () => {
		withTempDir((dir) => {
			const file = join(dir, "a.ts");
			writeFileSync(file, "dup dup", "utf-8");

			const outcome = applyRewind(
				{
					fromEntryId: "u1",
					edits: [{ entryId: "a1", path: "a.ts", edits: [{ oldText: "x", newText: "dup" }] }],
					irreversible: [],
					files: ["a.ts"],
				},
				{ cwd: dir, apply: true },
			);

			assert.strictEqual(outcome.changed.length, 0, "an ambiguous match must not be guessed");
			assert.match(outcome.skipped[0]!.reason, /appears 2 times/);
		});
	});

	it("skips a file that no longer exists", () => {
		withTempDir((dir) => {
			const outcome = applyRewind(
				{
					fromEntryId: "u1",
					edits: [{ entryId: "a1", path: "gone.ts", edits: [{ oldText: "a", newText: "b" }] }],
					irreversible: [],
					files: ["gone.ts"],
				},
				{ cwd: dir, apply: true },
			);

			assert.strictEqual(outcome.changed.length, 0);
			assert.match(outcome.skipped[0]!.reason, /no longer exists/);
		});
	});

	it("carries write and bash through to the report so the user is told", () => {
		const irreversible = [{ entryId: "a2", tool: "write" as const, path: "n.ts" }];
		const outcome = applyRewind(
			{ fromEntryId: "u1", edits: [], irreversible, files: [] },
			{ cwd: "/tmp", apply: true },
		);

		assert.deepStrictEqual(outcome.notReversible, irreversible);
		assert.match(describeOutcome(outcome), /cannot be undone/);
	});

	it("states plainly that a dry run changed nothing", () => {
		const outcome = applyRewind({ fromEntryId: "u1", edits: [], irreversible: [], files: [] }, { cwd: "/tmp" });
		assert.match(describeOutcome(outcome), /No files were changed/);
	});
});

function readBackupContents(dir: string): string[] {
	return readdirSync(dir).map((name) => readFileSync(join(dir, name), "utf-8"));
}
