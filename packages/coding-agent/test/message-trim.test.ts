/**
 * Message trimming.
 *
 * The trim that matters is the lossless one: a huge pasted block leaves the message but survives on
 * disk. These tests pin that the content is recoverable and that a small message is never rewritten.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { estimateTokens, trimMessage } from "../src/utils/message-trim.ts";

/** Collects written blocks instead of touching the filesystem. */
function collector() {
	const written: { content: string; lines: number }[] = [];
	const writer = (content: string, lines: number) => {
		written.push({ content, lines });
		return `/saved/block-${written.length}.txt`;
	};
	return { written, writer };
}

/** A log-like body with `count` lines. */
function logBody(count: number, prefix = "2026-10-17 INFO request handled id="): string {
	return Array.from({ length: count }, (_, index) => `${prefix}${index}`).join("\n");
}

describe("trimMessage", () => {
	it("leaves a short message alone", () => {
		const { written, writer } = collector();
		const text = "fix the failing test in src/a.ts";
		const result = trimMessage(text, writer);
		assert.strictEqual(result.text, text);
		assert.deepStrictEqual(written, []);
		assert.strictEqual(result.removedLines, 0);
	});

	it("moves a large block out and leaves a reference behind", () => {
		const { written, writer } = collector();
		const body = logBody(400);
		const text = `why does this fail?\n\n${body}\n\nwhat should I change?`;

		const result = trimMessage(text, writer, { minBlockLines: 100, minMessageChars: 1000 });

		assert.strictEqual(written.length, 1);
		assert.strictEqual(written[0]!.lines, 400);
		assert.ok(result.savedPath, "expected a saved path");
		assert.match(result.text, /large block saved to \/saved\/block-1\.txt/);
		assert.ok(result.text.includes("why does this fail?"), "the question must survive");
		assert.ok(result.text.includes("what should I change?"), "the follow-up must survive");
		assert.ok(!result.text.includes("id=200"), "the block body must leave the message");
		assert.ok(result.removedLines >= 399);
	});

	it("writes the block byte for byte so it can be recovered", () => {
		const { written, writer } = collector();
		const body = logBody(400);
		trimMessage(`look:\n\n${body}`, writer, { minBlockLines: 100, minMessageChars: 1000 });
		assert.strictEqual(written[0]!.content, body);
	});

	it("does not move a block shorter than the line threshold", () => {
		const { written, writer } = collector();
		const body = logBody(50);
		const text = `look:\n\n${body}`.padEnd(25_000, "x");
		const result = trimMessage(text, writer);
		assert.deepStrictEqual(written, []);
		assert.strictEqual(result.savedPath, undefined);
	});

	it("keeps the block when the writer throws, so a read-only workspace loses nothing", () => {
		const failing = () => {
			throw new Error("EROFS: read-only file system");
		};
		const body = logBody(400);
		const result = trimMessage(`look:\n\n${body}`, failing, { minBlockLines: 100, minMessageChars: 1000 });
		assert.strictEqual(result.savedPath, undefined);
		assert.ok(result.text.includes("id=200"), "content must stay when it cannot be saved");
	});

	it("keeps the block when no writer is available", () => {
		const body = logBody(400);
		const result = trimMessage(`look:\n\n${body}`, undefined, { minBlockLines: 100, minMessageChars: 1000 });
		assert.ok(result.text.includes("id=200"));
	});

	it("absorbs gaps inside a log instead of cutting it in two", () => {
		const { written, writer } = collector();
		const chunks = [logBody(120, "a="), "", logBody(120, "b="), "", logBody(120, "c=")];
		const text = `why?\n\n${chunks.join("\n")}\n\nfix it`;
		const result = trimMessage(text, writer, { minBlockLines: 100, minMessageChars: 1000 });
		assert.strictEqual(written.length, 1, "one block, not three fragments");
		assert.strictEqual(written[0]!.lines, 362);
		assert.ok(result.text.includes("why?") && result.text.includes("fix it"));
	});

	it("folds immediately repeated lines and states the count", () => {
		const repeated = Array.from({ length: 40 }, () => "at Object.<anonymous> (/app/index.js:1:1)").join("\n");
		const text = `stack:\n${repeated}`;
		const result = trimMessage(text, undefined, { minMessageChars: 100 });
		assert.match(result.text, /at Object\.<anonymous> \(\/app\/index\.js:1:1\) {2}\(x40\)/);
		assert.strictEqual(result.foldedLines, 39);
	});

	it("does not fold blank lines into a count", () => {
		const text = `a\n\n\n\n\nb`.padEnd(200, "y");
		const result = trimMessage(text, undefined, { minMessageChars: 100 });
		assert.ok(!result.text.includes("(x"), `blank runs must not be folded: ${JSON.stringify(result.text)}`);
	});

	it("shortens a payload token but keeps its head", () => {
		const blob = "A".repeat(1000);
		const result = trimMessage(`token: ${blob}`.padEnd(250, "z"), undefined, { minMessageChars: 100 });
		assert.match(result.text, /A{64}\.\.\.\(1000 chars\)/);
		assert.strictEqual(result.shortenedTokens, 1);
	});

	it("collapses runs of blank lines to one", () => {
		const text = `para one\n\n\n\n\npara two`.padEnd(200, "y");
		const result = trimMessage(text, undefined, { minMessageChars: 100 });
		assert.ok(result.text.includes("para one\n\npara two"), JSON.stringify(result.text));
	});

	it("removes trailing whitespace", () => {
		const text = `a   \nb\t\t`.padEnd(200, "y");
		const result = trimMessage(text, undefined, { minMessageChars: 100 });
		assert.ok(!/[ \t]+\n/.test(result.text), JSON.stringify(result.text));
	});

	it("never grows the message", () => {
		const { writer } = collector();
		const body = logBody(400);
		const text = `why?\n\n${body}`;
		const result = trimMessage(text, writer, { minBlockLines: 100, minMessageChars: 1000 });
		assert.ok(result.text.length <= text.length);
	});
});

describe("estimateTokens", () => {
	it("uses the repository convention of four characters per token", () => {
		assert.strictEqual(estimateTokens(""), 0);
		assert.strictEqual(estimateTokens("abcd"), 1);
		assert.strictEqual(estimateTokens("abcde"), 2);
	});
});
