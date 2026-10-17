/**
 * Trim a user message before it is sent.
 *
 * Wired to the `input` event, which runs before the message becomes a session entry, so the saving
 * applies to every later request that carries it. `safe` (the default) moves a large pasted block to a
 * file and applies the deterministic reductions; nothing is lost, because the block is on disk and the
 * message points at it.
 *
 * A separate model call to rewrite the message is deliberately not offered. The message is carried by
 * every later request, so shortening N tokens to M saves T * (N - M) over T requests, but the call
 * itself costs about N + M; for a normal short message the call costs more than it can ever save, and
 * whether the meaning survived cannot be checked automatically. Moving the payload out is lossless and
 * free, so it does the work instead.
 *
 * Configuration, because `ExtensionContext` exposes no settings handle:
 * - `PI_MESSAGE_TRIM=off` disables it.
 * - `PI_MESSAGE_TRIM_MIN_LINES` and `PI_MESSAGE_TRIM_MIN_CHARS` set the block thresholds.
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "../../config.ts";
import type { ExtensionAPI } from "../../core/extensions/types.ts";
import { estimateTokens, trimMessage } from "../../utils/message-trim.ts";

/** Saved blocks live beside the session data, not in the user's project. */
const PASTE_DIR_NAME = "pastes";

function isEnabled(): boolean {
	const value = process.env.PI_MESSAGE_TRIM?.trim().toLowerCase();
	return !(value === "off" || value === "0" || value === "false" || value === "no");
}

function readNumber(name: string): number | undefined {
	const raw = process.env[name]?.trim();
	if (!raw) return undefined;
	const value = Number(raw);
	return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

/** Write the block under the agent directory, keyed by content so the same paste is stored once. */
function writeBlock(content: string): string {
	const directory = join(getAgentDir(), PASTE_DIR_NAME);
	mkdirSync(directory, { recursive: true });
	const digest = createHash("sha256").update(content).digest("hex").slice(0, 12);
	const path = join(directory, `paste-${digest}.txt`);
	writeFileSync(path, content, "utf-8");
	return path;
}

export default function messageTrimExtension(pi: ExtensionAPI): void {
	pi.on("input", async (event, ctx) => {
		// Only a human's own message is rewritten. Extensions and RPC callers know what they are sending,
		// and a shell command or slash command must reach its handler exactly as typed.
		if (event.source !== "interactive") return undefined;
		if (!isEnabled()) return undefined;
		const text = event.text;
		if (!text || text.startsWith("!") || text.startsWith("/")) return undefined;

		try {
			const result = trimMessage(text, writeBlock, {
				minBlockLines: readNumber("PI_MESSAGE_TRIM_MIN_LINES"),
				minMessageChars: readNumber("PI_MESSAGE_TRIM_MIN_CHARS"),
			});
			if (result.text === text) return undefined;

			// Say what happened: a message that changed under the user must be visible.
			const before = estimateTokens(text);
			const after = estimateTokens(result.text);
			const saved = result.savedPath ? " content saved to file" : "";
			ctx.ui.setStatus("message-trim", `trimmed ~${before} to ~${after} tokens${saved}`);
			setTimeout(() => ctx.ui.setStatus("message-trim", undefined), 5000);

			return { action: "transform", text: result.text };
		} catch {
			// A trim that fails must never block the message.
			return undefined;
		}
	});
}
