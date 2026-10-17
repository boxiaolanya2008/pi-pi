/**
 * The contract between the main process and the window.
 *
 * Both sides import this file, so a channel name or payload shape cannot drift apart silently. The window
 * is untrusted: it has no Node access and reaches the agent only through the preload bridge built here.
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";

/** IPC channel names. Kept as a const object so a typo is a type error rather than a dead channel. */
export const IPC = {
	snapshot: "pi:snapshot",
	sendPrompt: "pi:send-prompt",
	abort: "pi:abort",
	chooseFolder: "pi:choose-folder",
	setCwd: "pi:set-cwd",
	event: "pi:event",
} as const;

/** What the window needs to render the session, and nothing more. */
export interface SessionSnapshot {
	ready: boolean;
	model?: string;
	thinkingLevel?: string;
	tools: string[];
	messages: AgentMessage[];
}

export interface SendPromptResult {
	ok: boolean;
	error?: string;
}

/** State-change signals. `delta` is separate because it carries the streamed text. */
export type DesktopSignal = "turn_end" | "settled" | "ready";

/** One message from the main process. `delta` is streamed text; the rest are state-change signals. */
export type DesktopEvent = { type: "delta"; detail: string } | { type: DesktopSignal };

/** The API the preload script exposes on `window.pi`. */
export interface PiBridge {
	getSnapshot(): Promise<SessionSnapshot>;
	sendPrompt(text: string): Promise<SendPromptResult>;
	abort(): Promise<void>;
	chooseFolder(): Promise<string | undefined>;
	setCwd(cwd: string): Promise<SendPromptResult>;
	/** Subscribe to events; returns an unsubscribe function. */
	onEvent(listener: (event: DesktopEvent) => void): () => void;
}
