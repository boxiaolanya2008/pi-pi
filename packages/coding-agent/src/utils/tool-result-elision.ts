/**
 * Elide old tool results from the request context.
 *
 * Each tool result stays in the conversation forever. One `read` of a 50 KB file is about 12k tokens,
 * and it is resent on every later request; a long session accumulates several of those and the history,
 * not the user's own words, becomes the bill. The result does not need to stay for the model to keep
 * working: the tool can be run again.
 *
 * Only the request context is changed. The session keeps every entry, so `/rewind`, export, and the
 * transcript still show what actually happened.
 *
 * This trades against prompt caching: the first elision of a result rewrites the prefix, which costs one
 * cache miss for that turn. A stub is deterministic, so the prefix is stable again afterwards, and a
 * result that would otherwise be resent forever is worth one miss.
 */

/** A block inside a tool result. */
interface ContentBlock {
	type: string;
	text?: string;
	[key: string]: unknown;
}

/** Minimal shape this module needs; the real messages carry more fields, which are preserved. */
export interface ElidableMessage {
	role: string;
	toolName?: string;
	content?: unknown;
	details?: unknown;
}

export interface ElisionOptions {
	/** Most recent tool results left untouched, so the current work stays intact. */
	keepRecent?: number;
	/** Tool results may use this many tokens before any of them is elided. */
	budgetTokens?: number;
	/**
	 * Anchor elision at the last user message (turn boundary) instead of a sliding "newest N" window.
	 *
	 * A sliding window rewrites the prefix on every new tool result — the result that just left the
	 * window is stubbed, invalidating every later byte of the request and forcing a full cache re-send.
	 * Turn-anchored elision only changes the prefix once per user turn, so the request prefix is stable
	 * for the whole turn and prompt-cache hits are preserved. Mid-turn results stay intact (bounded by
	 * `turnHardCapTokens`), which is safe: they are the model's current working set.
	 */
	anchorToTurn?: boolean;
	/**
	 * Hard cap on current-turn tool-result tokens before mid-turn elision kicks in (only in turn-anchored
	 * mode). Default: 2 × budgetTokens. A turn with 20 large reads would otherwise blow up the request
	 * before the next turn boundary.
	 */
	turnHardCapTokens?: number;
}

export interface ElisionResult<T extends ElidableMessage> {
	messages: T[];
	/** Results replaced by a stub. */
	elided: number;
	/** Characters removed from the request. */
	savedChars: number;
}

const DEFAULT_KEEP_RECENT = 8;
const DEFAULT_BUDGET_TOKENS = 20_000;
const DEFAULT_TURN_HARD_CAP_MULTIPLIER = 2;

/**
 * Results whose stub would not shrink them are kept by the main loop, but they still count against the
 * budget. If every candidate is tiny, the loop exhausts them without meeting the budget — correct, but
 * candidates must then be filtered to the ones that can actually shrink, or a long prefix of stubs gets
 * re-examined every request for nothing. This set is derived per call from message shape, not cached.
 */

/** Rough token estimate matching the repository's own convention. */
function estimateTokens(chars: number): number {
	return Math.ceil(chars / 4);
}

/** Characters a message occupies in the request, including its details payload. */
function sizeOf(message: ElidableMessage): number {
	let chars = 0;
	const content = message.content;
	if (typeof content === "string") {
		chars += content.length;
	} else if (Array.isArray(content)) {
		for (const block of content as ContentBlock[]) {
			if (typeof block?.text === "string") chars += block.text.length;
			// An image is sent as base64; count it so an old screenshot is not treated as cheap.
			else if (typeof block === "object" && block !== null) chars += JSON.stringify(block).length;
		}
	}
	if (message.details !== undefined) {
		try {
			chars += JSON.stringify(message.details)?.length ?? 0;
		} catch {
			// A non-serializable details payload contributes nothing to the request.
		}
	}
	return chars;
}

/** The stub that replaces a result, naming the tool so the model can decide to run it again. */
function stubFor(message: ElidableMessage, chars: number): string {
	const tool = message.toolName ?? "tool";
	return `[${tool} result elided: ${chars} chars. Run the tool again if you need it.]`;
}

/**
 * Find the indices of tool results eligible for elision in turn-anchored mode.
 *
 * Candidates are results before the last user message (previous turns), minus the newest `keepRecent`
 * of those so the immediately-prior turn's context is preserved. If previous-turn results alone exceed
 * the budget (a very long turn), current-turn results become candidates from the oldest, except the
 * newest `keepRecent` — a last-resort overflow that trades one cache miss for request-size sanity.
 */
function turnAnchoredCandidates<T extends ElidableMessage>(
	messages: readonly T[],
	resultIndices: readonly number[],
	options: ElisionOptions,
	budget: number,
): number[] {
	const keepRecent = options.keepRecent ?? DEFAULT_KEEP_RECENT;
	const turnHardCap = options.turnHardCapTokens ?? budget * DEFAULT_TURN_HARD_CAP_MULTIPLIER;

	let lastUser = -1;
	for (let index = messages.length - 1; index >= 0; index--) {
		if (messages[index]!.role === "user") {
			lastUser = index;
			break;
		}
	}

	// No user message: fall back to the sliding window rather than eliding everything.
	if (lastUser < 0) {
		return resultIndices.slice(0, Math.max(0, resultIndices.length - keepRecent));
	}

	const previousTurn = resultIndices.filter((index) => index < lastUser);
	const currentTurn = resultIndices.filter((index) => index > lastUser);
	const previousTurnChars = previousTurn.reduce((total, index) => total + sizeOf(messages[index]!), 0);

	// Previous-turn results fit the cap: nothing before the turn boundary may change, so the request
	// prefix is byte-stable for the whole turn and prompt-cache hits survive.
	if (previousTurnChars <= turnHardCap) {
		return previousTurn.slice(0, Math.max(0, previousTurn.length - keepRecent));
	}

	// A single turn blew past the hard cap (many large reads): let current-turn results join as
	// candidates too, but never the newest `keepRecent` — the model is probably still using those.
	return [...previousTurn, ...currentTurn.slice(0, Math.max(0, currentTurn.length - keepRecent))];
}

/**
 * Replace the oldest tool results with stubs until the budget is met.
 *
 * Recent results and small results are kept: eliding a short result saves little and costs the model
 * information it may be relying on.
 *
 * With `anchorToTurn`, elision is anchored at the last user message: results from previous turns are
 * elided down to the budget, current-turn results are kept intact (unless they alone exceed
 * `turnHardCapTokens`). The elision set only changes when a new user message arrives — once per turn
 * instead of once per tool call — so the prompt-cache prefix stays byte-stable within a turn.
 */
export function elideToolResults<T extends ElidableMessage>(
	messages: readonly T[],
	options: ElisionOptions = {},
): ElisionResult<T> {
	const keepRecent = options.keepRecent ?? DEFAULT_KEEP_RECENT;
	const budget = options.budgetTokens ?? DEFAULT_BUDGET_TOKENS;

	const resultIndices: number[] = [];
	for (let index = 0; index < messages.length; index++) {
		if (messages[index]!.role === "toolResult") resultIndices.push(index);
	}

	let totalChars = resultIndices.reduce((total, index) => total + sizeOf(messages[index]!), 0);
	const unchanged: ElisionResult<T> = { messages: [...messages], elided: 0, savedChars: 0 };
	if (estimateTokens(totalChars) <= budget) return unchanged;

	// Turn-anchored: candidates are only results before the last user message; mid-turn results are
	// protected so the prefix does not change between user turns.
	const candidates = options.anchorToTurn
		? turnAnchoredCandidates(messages, resultIndices, options, budget)
		: resultIndices.slice(0, Math.max(0, resultIndices.length - keepRecent));
	const next = [...messages];
	let elided = 0;
	let savedChars = 0;

	for (const index of candidates) {
		if (estimateTokens(totalChars) <= budget) break;
		const message = next[index]!;
		const before = sizeOf(message);
		const stub = stubFor(message, before);
		// Never replace a result with something larger, and skip results that are already stubs.
		if (stub.length >= before) continue;
		if (typeof message.content === "string" && message.content.startsWith("[") && message.content.endsWith("]")) {
			continue;
		}

		next[index] = {
			...message,
			content: [{ type: "text", text: stub }],
			details: undefined,
		} as T;

		const after = sizeOf(next[index]!);
		totalChars -= before - after;
		savedChars += before - after;
		elided++;
	}

	return { messages: next, elided, savedChars };
}
