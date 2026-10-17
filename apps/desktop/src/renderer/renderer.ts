/**
 * Renderer.
 *
 * Renders the transcript the main process owns, and appends streamed text as it arrives. It has no model
 * logic and no Node access: everything goes through the `window.pi` bridge.
 *
 * Text is inserted with `textContent`, never `innerHTML`, because message content is whatever the model or
 * a tool produced and must not become markup.
 */

import type { DesktopEvent, PiBridge, SessionSnapshot } from "../shared.ts";

declare global {
	interface Window {
		pi: PiBridge;
	}
}

const bridge = window.pi;

function element<T extends HTMLElement>(id: string): T {
	const found = document.getElementById(id);
	if (!found) throw new Error(`Missing element #${id}`);
	return found as T;
}

const transcript = element<HTMLElement>("transcript");
const input = element<HTMLTextAreaElement>("input");
const sendButton = element<HTMLButtonElement>("send");
const abortButton = element<HTMLButtonElement>("abort");
const folderButton = element<HTMLButtonElement>("folder");
const cwdLabel = element<HTMLElement>("cwd");
const modelLabel = element<HTMLElement>("model");
const thinkingPill = element<HTMLElement>("thinking");
const status = element<HTMLElement>("status");

/** The assistant message currently being streamed into, or undefined when idle. */
let streaming: HTMLElement | undefined;

function showStatus(message: string | undefined): void {
	status.textContent = message ?? "";
	status.hidden = message === undefined;
}

/** Flatten one message's content into plain lines the transcript can show. */
function textOf(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const block of content) {
		if (typeof block !== "object" || block === null) continue;
		const typed = block as { type?: string; text?: string; toolName?: string };
		if (typed.type === "text" && typeof typed.text === "string") parts.push(typed.text);
		else if (typed.type === "image") parts.push("[image]");
		else if (typed.type === "toolCall") parts.push(`[tool: ${typed.toolName ?? "unknown"}]`);
	}
	return parts.join("\n");
}

function appendMessage(role: string, text: string): HTMLElement {
	const row = document.createElement("article");
	row.className = `msg ${role}`;
	const label = document.createElement("div");
	label.className = "role";
	label.textContent = role;
	const body = document.createElement("div");
	body.className = "body";
	body.textContent = text;
	row.append(label, body);
	transcript.append(row);
	return body;
}

function render(snapshot: SessionSnapshot): void {
	transcript.replaceChildren();
	streaming = undefined;
	cwdLabel.textContent = snapshot.ready ? "" : "starting…";
	modelLabel.textContent = snapshot.model ?? "no model";
	thinkingPill.textContent = snapshot.thinkingLevel ?? "";
	thinkingPill.hidden = !snapshot.thinkingLevel;
	abortButton.hidden = true;

	for (const message of snapshot.messages) {
		const typed = message as { role?: string; content?: unknown };
		const role = typed.role ?? "unknown";
		if (role === "system") continue;
		appendMessage(role, textOf(typed.content));
	}
	transcript.scrollTop = transcript.scrollHeight;
}

async function refresh(): Promise<void> {
	render(await bridge.getSnapshot());
}

function onEvent(event: DesktopEvent): void {
	switch (event.type) {
		case "delta": {
			if (!streaming) streaming = appendMessage("assistant", "");
			streaming.textContent += event.detail;
			transcript.scrollTop = transcript.scrollHeight;
			return;
		}
		case "turn_end":
			// The settled transcript is authoritative; re-read it instead of trusting appended deltas.
			streaming = undefined;
			void refresh();
			return;
		case "settled":
			streaming = undefined;
			abortButton.hidden = true;
			void refresh();
			return;
		case "ready":
			void refresh();
			return;
		default:
			return;
	}
}

async function submit(): Promise<void> {
	const text = input.value.trim();
	if (text === "") return;

	appendMessage("user", text);
	input.value = "";
	resizeInput();
	showStatus(undefined);
	abortButton.hidden = false;

	const result = await bridge.sendPrompt(text);
	if (!result.ok) {
		showStatus(result.error ?? "The message could not be sent.");
		abortButton.hidden = true;
		// The transcript is re-read from the session, which never received the message.
		await refresh();
	}
}

function resizeInput(): void {
	input.style.height = "auto";
	input.style.height = `${Math.min(input.scrollHeight, 240)}px`;
}

input.addEventListener("input", resizeInput);
input.addEventListener("keydown", (event) => {
	if (event.key === "Enter" && !event.shiftKey) {
		event.preventDefault();
		void submit();
	}
});
sendButton.addEventListener("click", () => void submit());
abortButton.addEventListener("click", () => void bridge.abort());

folderButton.addEventListener("click", async () => {
	const chosen = await bridge.chooseFolder();
	if (!chosen) return;
	const result = await bridge.setCwd(chosen);
	if (!result.ok) {
		showStatus(result.error ?? "Could not open that folder.");
		return;
	}
	cwdLabel.textContent = chosen;
	await refresh();
});

bridge.onEvent(onEvent);
void refresh();
