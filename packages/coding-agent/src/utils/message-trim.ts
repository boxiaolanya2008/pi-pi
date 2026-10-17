/**
 * Trim a user message before it enters the conversation.
 *
 * The editor collapses a large paste to `[paste #1 +234 lines]` for display only; `submitValue()`
 * expands it again, so a pasted log becomes a full-length user message that every later request
 * carries until compaction. Moving that block to a file keeps the content, because the model can
 * `read` it, while removing it from the prompt. That is the one trim here that is both lossless and
 * free.
 *
 * The deterministic rules are the cheap part: duplicate lines with a count, over-long tokens, and
 * whitespace. Fenced code is never touched, because its whitespace and repeated lines can be the
 * meaning.
 */

/** Lines a block needs before it is worth moving out of the message. */
const DEFAULT_MIN_BLOCK_LINES = 300;
/** Message size below which nothing is moved, however it is shaped. */
const DEFAULT_MIN_MESSAGE_CHARS = 20_000;
/** Consecutive blank lines that always end a block. */
const BLANK_LINES_END_BLOCK = 3;
/**
 * A blank line ends a block until the block is this long. Short prose separated by blank lines stays
 * out of the block, so the user's own question is never swept into a pasted payload; once a block is
 * clearly a document, single blank lines inside it are treated as its own formatting.
 */
const ABSORB_BLANKS_AFTER_LINES = 50;
/** A paragraph this short after the last blank is the user's prose, not the payload. */
const PROSE_TAIL_LINES = 20;
/** An unbroken token longer than this is payload (base64, hash, minified blob), not prose. */
const MAX_TOKEN_CHARS = 512;

export interface TrimOptions {
	minBlockLines?: number;
	minMessageChars?: number;
}

export interface TrimResult {
	/** The text to send instead of the original. */
	text: string;
	/** Path the removed block was written to, when a block was removed. */
	savedPath?: string;
	/** Lines removed from the message. */
	removedLines: number;
	/** Duplicate lines folded away. */
	foldedLines: number;
	/** Over-long tokens shortened. */
	shortenedTokens: number;
}

/** Writes the block and returns its path. Injected so the pure logic stays testable. */
export type BlockWriter = (content: string, lines: number) => string;

interface Block {
	start: number;
	end: number;
}

/**
 * The longest run of dense lines.
 *
 * A blank line ends the run while it is still short, which keeps the user's question separate from a
 * pasted payload. Once the run is long enough to be a document, single blank lines are absorbed; three
 * in a row always end it, because that is how documents separate sections.
 */
function findLongestBlock(lines: readonly string[]): Block | undefined {
	let best: Block | undefined;
	let start = 0;
	let blankRun = 0;

	// Trim blank padding at the edges so the saved file holds the payload, not the spacing around it,
	// and give back any short paragraph after the last blank: that is the user's prose, not the
	// payload, even though a long run is allowed to absorb blanks inside a document.
	const closeRun = (runStart: number, runEnd: number) => {
		let from = runStart;
		let to = runEnd;
		const trimEdges = () => {
			while (from < to && (lines[from] ?? "").trim() === "") from++;
			while (to > from && (lines[to - 1] ?? "").trim() === "") to--;
		};
		trimEdges();
		for (let index = to - 1; index >= from; index--) {
			if ((lines[index] ?? "").trim() !== "") continue;
			if (to - index - 1 < PROSE_TAIL_LINES) {
				to = index;
				trimEdges();
			}
			break;
		}
		const length = to - from;
		if (length > 0 && (!best || length > best.end - best.start)) best = { start: from, end: to };
	};

	for (let index = 0; index < lines.length; index++) {
		if ((lines[index] ?? "").trim() !== "") {
			blankRun = 0;
			continue;
		}

		blankRun++;
		const longEnoughToAbsorb = index - blankRun + 1 - start >= ABSORB_BLANKS_AFTER_LINES;
		if (blankRun >= BLANK_LINES_END_BLOCK || !longEnoughToAbsorb) {
			closeRun(start, index - blankRun + 1);
			start = index + 1;
			blankRun = 0;
		}
	}
	closeRun(start, lines.length);
	return best;
}

/** Fold immediately repeated identical lines into one line carrying a count. */
function foldDuplicateLines(lines: readonly string[]): { lines: string[]; folded: number } {
	const result: string[] = [];
	let folded = 0;

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] ?? "";
		let repeats = 1;
		while (index + repeats < lines.length && lines[index + repeats] === line) repeats++;

		if (repeats > 1 && line.trim() !== "") {
			result.push(`${line}  (x${repeats})`);
			folded += repeats - 1;
			index += repeats - 1;
		} else {
			result.push(line);
		}
	}

	return { lines: result, folded };
}

/** Shorten an unbroken payload token, keeping the head so the value is still identifiable. */
function shortenLongTokens(line: string): { line: string; shortened: number } {
	let shortened = 0;
	const next = line.replace(/\S{200,}/g, (token) => {
		if (token.length <= MAX_TOKEN_CHARS) return token;
		shortened++;
		return `${token.slice(0, 64)}...(${token.length} chars)`;
	});
	return { line: next, shortened };
}

/** Collapse trailing spaces and runs of blank lines. */
function normalizeWhitespace(lines: readonly string[]): string[] {
	const result: string[] = [];
	let blanks = 0;
	for (const line of lines) {
		const trimmed = line.replace(/\s+$/, "");
		if (trimmed === "") {
			blanks++;
			if (blanks > 1) continue;
		} else {
			blanks = 0;
		}
		result.push(trimmed);
	}
	return result;
}

/**
 * Trim `text` for sending.
 *
 * A block is only moved when the message is genuinely large, so an ordinary question is never
 * rewritten. When no writer is given, or it throws, the block stays in the message: a trim that
 * cannot preserve the content must not remove it.
 */
export function trimMessage(text: string, writer: BlockWriter | undefined, options: TrimOptions = {}): TrimResult {
	const minBlockLines = options.minBlockLines ?? DEFAULT_MIN_BLOCK_LINES;
	const minMessageChars = options.minMessageChars ?? DEFAULT_MIN_MESSAGE_CHARS;
	const unchanged: TrimResult = { text, removedLines: 0, foldedLines: 0, shortenedTokens: 0 };

	if (text.length < minMessageChars) return unchanged;

	let lines = text.split("\n");
	let removedLines = 0;
	let savedPath: string | undefined;

	const block = findLongestBlock(lines);
	if (block && block.end - block.start >= minBlockLines && writer) {
		const content = lines.slice(block.start, block.end).join("\n");
		try {
			savedPath = writer(content, block.end - block.start);
			const reference = `<large block saved to ${savedPath} (${block.end - block.start} lines); read it with the read tool if needed>`;
			lines = [...lines.slice(0, block.start), reference, ...lines.slice(block.end)];
			removedLines = block.end - block.start - 1;
		} catch {
			// The workspace may be read-only. Keep the content rather than lose it.
			savedPath = undefined;
		}
	}

	const { lines: foldedLines, folded } = foldDuplicateLines(lines);
	const shortened = foldedLines.map(shortenLongTokens);
	const normalized = normalizeWhitespace(shortened.map((entry) => entry.line));

	return {
		text: normalized.join("\n"),
		...(savedPath ? { savedPath } : {}),
		removedLines,
		foldedLines: folded,
		shortenedTokens: shortened.reduce((total, entry) => total + entry.shortened, 0),
	};
}

/** Rough token estimate matching the repository's own convention. */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}
