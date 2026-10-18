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
	listCommands: "pi:list-commands",
	runCommand: "pi:run-command",
	setModel: "pi:set-model",
	listModels: "pi:list-models",
	setThinking: "pi:set-thinking",
	listThinking: "pi:list-thinking",
	request: "pi:request",
	respond: "pi:respond",
	pasteImage: "pi:paste-image",
} as const;

/** Where a pasted image was stored, so the window can show it and the message can reference it. */
export interface PastedImage {
	/** Absolute path in the agent directory. */
	path: string;
	mimeType: string;
	bytes: number;
}

/** A model offered by the picker, flattened so the window does not carry SDK objects. */
export interface ModelOption {
	id: string;
	provider: string;
	label: string;
	isCurrent: boolean;
}

/** A slash command the session can run, from the extension command registry. */
export interface CommandOption {
	name: string;
	description?: string;
	source: string;
}

/** A question or notice the main process sends to the window, before an id is attached. */
export type UiRequestBody =
	| { kind: "select"; title: string; options: string[] }
	| { kind: "input"; title: string; placeholder?: string }
	| { kind: "confirm"; title: string; message: string }
	| { kind: "notify"; level: "info" | "warning" | "error"; message: string }
	| { kind: "status"; level: "info"; message: string };

/** What actually crosses IPC: the body plus the id an answer refers to. */
export type UiRequest = UiRequestBody & { id: string };

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
export type DesktopSignal = "turn_end" | "settled" | "ready" | "commands" | "model_changed";

/** One message from the main process to the window. */
export type DesktopEvent =
	| { type: "delta"; detail: string }
	| { type: DesktopSignal }
	| { type: "ui_request"; request: UiRequest };

/** The API the preload script exposes on `window.pi`. */
export interface PiBridge {
	getSnapshot(): Promise<SessionSnapshot>;
	sendPrompt(text: string): Promise<SendPromptResult>;
	abort(): Promise<void>;
	chooseFolder(): Promise<string | undefined>;
	setCwd(cwd: string): Promise<SendPromptResult>;
	listCommands(): Promise<CommandOption[]>;
	runCommand(name: string, args: string): Promise<SendPromptResult>;
	listModels(): Promise<ModelOption[]>;
	setModel(id: string, provider: string): Promise<SendPromptResult>;
	listThinking(): Promise<string[]>;
	setThinking(level: string): Promise<SendPromptResult>;
	/** Store a pasted image and return where it landed. */
	pasteImage(data: Uint8Array, mimeType: string): Promise<PastedImage>;
	/** Subscribe to events; returns an unsubscribe function. */
	onEvent(listener: (event: DesktopEvent) => void): () => void;
	/** Answer a `ui_request`; call `undefined` to dismiss. */
	respond(id: string, value: string | undefined): void;
}
