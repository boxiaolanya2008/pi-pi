/**
 * Trim tool results out of the request context once they stop paying for themselves.
 *
 * Each result is resent on every later request. A few large reads or a long command output dominate the
 * bill long after the model has stopped needing them, and the tool can always be run again. The session
 * keeps every entry, so the transcript, `/rewind`, and export are unaffected; only the request is shaped.
 *
 * This costs one prefix cache miss per result at the moment it is first elided. A stub is deterministic,
 * so the prefix is stable again afterwards, and a result resent forever is worth one miss.
 *
 * Configuration, because `ExtensionContext` exposes no settings handle:
 * - `PI_TOOL_RESULT_TRIM=off` disables it.
 * - `PI_TOOL_RESULT_KEEP` is how many of the newest results stay intact (default 8).
 * - `PI_TOOL_RESULT_BUDGET` is the token budget for all results together (default 20000).
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI } from "../../core/extensions/types.ts";
import { elideToolResults } from "../../utils/tool-result-elision.ts";

function isEnabled(): boolean {
	const value = process.env.PI_TOOL_RESULT_TRIM?.trim().toLowerCase();
	return !(value === "off" || value === "0" || value === "false" || value === "no");
}

function readNumber(name: string): number | undefined {
	const raw = process.env[name]?.trim();
	if (!raw) return undefined;
	const value = Number(raw);
	return Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
}

export default function toolResultTrimExtension(pi: ExtensionAPI): void {
	// `context` fires before every provider request, so the shaping applies to each turn, not just the
	// first. Elision is idempotent: a stub is never rewritten.
	pi.on("context", async (event, ctx) => {
		if (!isEnabled()) return undefined;
		try {
			const result = elideToolResults(event.messages as AgentMessage[], {
				keepRecent: readNumber("PI_TOOL_RESULT_KEEP"),
				budgetTokens: readNumber("PI_TOOL_RESULT_BUDGET"),
			});
			if (result.elided === 0) return undefined;

			const saved = Math.ceil(result.savedChars / 4);
			ctx.ui.setStatus("tool-result-trim", `elided ${result.elided} old tool results (~${saved} tokens)`);
			setTimeout(() => ctx.ui.setStatus("tool-result-trim", undefined), 5000);

			return { messages: result.messages };
		} catch {
			// Shaping the context must never break a run.
			return undefined;
		}
	});
}
