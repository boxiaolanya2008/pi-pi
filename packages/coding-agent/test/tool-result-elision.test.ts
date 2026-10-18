/**
 * Tool result elision.
 *
 * The property that matters: the newest results stay intact, the session is never modified, and a stub
 * is never larger than what it replaces.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { type ElidableMessage, elideToolResults } from "../src/utils/tool-result-elision.ts";

function toolResult(text: string, toolName = "read"): ElidableMessage {
	// Real entries also carry toolCallId; the module does not depend on it.
	return { role: "toolResult", toolName, content: [{ type: "text", text }] } as ElidableMessage;
}

function userText(text: string): ElidableMessage {
	return { role: "user", content: [{ type: "text", text }] };
}

function assistantText(text: string): ElidableMessage {
	return { role: "assistant", content: [{ type: "text", text }] };
}

/** A payload of roughly `chars` characters. */
function payload(chars: number): string {
	return "x".repeat(chars);
}

describe("elideToolResults", () => {
	it("leaves a small history untouched", () => {
		const messages = [userText("hi"), toolResult("short")];
		const result = elideToolResults(messages, { budgetTokens: 1000 });
		assert.strictEqual(result.elided, 0);
		assert.deepStrictEqual(result.messages, messages);
	});

	it("elides the oldest results first and keeps the recent ones", () => {
		const messages = [
			toolResult(payload(40_000), "read"),
			toolResult(payload(40_000), "bash"),
			toolResult("recent one", "read"),
			toolResult("recent two", "grep"),
		];
		const result = elideToolResults(messages, { keepRecent: 2, budgetTokens: 1000 });

		assert.strictEqual(result.elided, 2);
		assert.match(String((result.messages[0]!.content as { text: string }[])[0]!.text), /read result elided/);
		assert.match(String((result.messages[1]!.content as { text: string }[])[0]!.text), /bash result elided/);
		assert.deepStrictEqual(result.messages[2], messages[2], "recent results must be untouched");
		assert.deepStrictEqual(result.messages[3], messages[3]);
	});

	it("stops once the budget is met", () => {
		const messages = Array.from({ length: 6 }, () => toolResult(payload(4000)));
		const result = elideToolResults(messages, { keepRecent: 0, budgetTokens: 2000 });
		assert.ok(result.elided < messages.length, "must not elide more than needed");
		assert.ok(result.elided > 0, "must elide something");
	});

	it("drops the details payload with the content", () => {
		const withDetails: ElidableMessage = {
			role: "toolResult",
			toolName: "codemode",
			content: [{ type: "text", text: payload(30_000) }],
			details: { calls: Array.from({ length: 100 }, () => ({ nested: payload(200) })) },
		};
		const messages = [withDetails, toolResult("recent", "read")];
		const result = elideToolResults(messages, { keepRecent: 1, budgetTokens: 100 });
		assert.strictEqual(result.messages[0]!.details, undefined, "details must not survive the stub");
	});

	it("never replaces a result with something larger", () => {
		const messages = [toolResult("tiny"), toolResult("tiny2")];
		const result = elideToolResults(messages, { keepRecent: 0, budgetTokens: 0 });
		for (const message of result.messages) {
			const text = String((message.content as { text?: string }[])[0]?.text ?? "");
			assert.doesNotMatch(text, /result elided/, "a tiny result must not be stubbed");
		}
		assert.strictEqual(result.elided, 0);
	});

	it("does not elide a result twice", () => {
		const messages = [toolResult(payload(40_000)), toolResult("recent")];
		const once = elideToolResults(messages, { keepRecent: 1, budgetTokens: 100 });
		const twice = elideToolResults(once.messages, { keepRecent: 1, budgetTokens: 100 });
		assert.strictEqual(twice.elided, 0, "a stub must not be rewritten");
		assert.deepStrictEqual(twice.messages, once.messages);
	});

	it("keeps user and assistant messages untouched", () => {
		const messages = [userText(payload(50_000)), toolResult(payload(40_000)), toolResult("recent")];
		const result = elideToolResults(messages, { keepRecent: 1, budgetTokens: 100 });
		assert.deepStrictEqual(result.messages[0], messages[0], "a long user message must survive");
	});

	it("counts an image block as expensive", () => {
		const imageResult: ElidableMessage = {
			role: "toolResult",
			toolName: "read",
			content: [{ type: "image", data: payload(60_000), mimeType: "image/png" }],
		};
		const messages = [imageResult, toolResult("recent")];
		const result = elideToolResults(messages, { keepRecent: 1, budgetTokens: 1000 });
		assert.strictEqual(result.elided, 1);
		assert.match(String((result.messages[0]!.content as { text: string }[])[0]!.text), /elided/);
	});

	it("returns a new array without mutating the input", () => {
		const messages = [toolResult(payload(40_000)), toolResult("recent")];
		const snapshot = JSON.stringify(messages);
		elideToolResults(messages, { keepRecent: 1, budgetTokens: 100 });
		assert.strictEqual(JSON.stringify(messages), snapshot, "the session history must not be modified");
	});

	it("saves a large share on a history of big reads", () => {
		const messages = Array.from({ length: 10 }, () => toolResult(payload(40_000)));
		const result = elideToolResults(messages, { keepRecent: 2, budgetTokens: 5000 });
		assert.ok(result.savedChars > 8 * 39_000, `expected a large saving, got ${result.savedChars}`);
	});
});

describe("elideToolResults (turn-anchored)", () => {
	it("never elides current-turn results while previous turns fit the budget", () => {
		const messages = [
			userText("task"),
			toolResult(payload(40_000)),
			toolResult(payload(40_000)),
			toolResult(payload(40_000)),
		];
		const result = elideToolResults(messages, {
			anchorToTurn: true,
			budgetTokens: 100,
			keepRecent: 0,
		});
		assert.strictEqual(result.elided, 0, "current-turn results must stay intact regardless of budget");
		assert.deepStrictEqual(result.messages, messages);
	});

	it("elides previous-turn results down to the budget", () => {
		const messages = [
			userText("old task"),
			toolResult(payload(40_000)),
			toolResult(payload(40_000)),
			toolResult("small old"),
			assistantText("ok"),
			userText("new task"),
			toolResult(payload(40_000)),
		];
		const result = elideToolResults(messages, {
			anchorToTurn: true,
			budgetTokens: 1000,
			keepRecent: 1,
		});
		assert.ok(result.elided >= 2, "old big results must be elided");
		assert.deepStrictEqual(result.messages[6], messages[6], "current-turn result must survive");
		assert.deepStrictEqual(result.messages[5], messages[5], "the user message must survive");
		const stubbed = String((result.messages[1]!.content as { text: string }[])[0]!.text);
		assert.match(stubbed, /read result elided/);
	});

	it("keeps the elision set stable as the current turn grows (cache-stable prefix)", () => {
		const turnStart = [
			userText("old task"),
			toolResult(payload(40_000)),
			toolResult(payload(40_000)),
			assistantText("done"),
			userText("new task"),
		];
		const withOneCall = [...turnStart, toolResult(payload(10_000))];
		const withTwoCalls = [...withOneCall, assistantText("thinking"), toolResult(payload(10_000))];
		// Keep the previous-turn results under the hard cap so mid-turn results stay protected.
		const options = { anchorToTurn: true, budgetTokens: 100, turnHardCapTokens: 100_000, keepRecent: 0 };

		const first = elideToolResults(withOneCall, options);
		const second = elideToolResults(withTwoCalls, options);

		// The prefix up to the turn boundary must be byte-identical across requests within the turn.
		assert.deepStrictEqual(
			second.messages.slice(0, 5),
			first.messages.slice(0, 5),
			"the elided prefix must not change while the turn grows",
		);
		assert.strictEqual(first.messages.length, withOneCall.length);
		// And the new results are untouched.
		assert.deepStrictEqual(second.messages[5], withOneCall[5]);
		assert.deepStrictEqual(second.messages[7], withTwoCalls[7]);
	});

	it("overflows into current turn only past the hard cap", () => {
		const messages = [
			userText("old task"),
			...Array.from({ length: 10 }, () => toolResult(payload(40_000))),
			assistantText("done"),
			userText("new task"),
			toolResult(payload(40_000)),
		];
		const result = elideToolResults(messages, {
			anchorToTurn: true,
			budgetTokens: 1000,
			turnHardCapTokens: 1000,
			keepRecent: 1,
		});
		assert.deepStrictEqual(result.messages[13], messages[13], "the newest current-turn result must survive");
		assert.ok(result.elided >= 10, "previous-turn results must be elided first");
	});

	it("falls back to sliding when no user message exists", () => {
		const messages = Array.from({ length: 6 }, () => toolResult(payload(40_000)));
		const result = elideToolResults(messages, { anchorToTurn: true, budgetTokens: 100, keepRecent: 2 });
		assert.strictEqual(result.elided, 4, "without a turn boundary the sliding window applies");
	});

	it("stubs are still never rewritten (idempotent)", () => {
		const messages = [userText("old"), toolResult(payload(40_000)), userText("new"), toolResult("small")];
		const options = { anchorToTurn: true, budgetTokens: 100, keepRecent: 0 };
		const once = elideToolResults(messages, options);
		const twice = elideToolResults(once.messages, options);
		assert.strictEqual(twice.elided, 0);
		assert.deepStrictEqual(twice.messages, once.messages);
	});
});
