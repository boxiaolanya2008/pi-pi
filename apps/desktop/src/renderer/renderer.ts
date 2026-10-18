/**
 * Renderer.
 *
 * Renders the transcript the main process owns, and appends streamed text as it arrives. It has no model
 * logic and no Node access: everything goes through the `window.pi` bridge.
 *
 * The one piece of real behavior here is the modal, which answers the questions an extension command asks
 * through the UI context. That is the same seam the terminal uses, so a command written once works in both.
 *
 * Text is inserted with `textContent`, never `innerHTML`, because message content is whatever the model or
 * a tool produced and must not become markup.
 */

import type { DesktopEvent, PiBridge, SessionSnapshot, UiRequest } from "../shared.ts";

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
const commandsButton = element<HTMLButtonElement>("commands");
const modelButton = element<HTMLButtonElement>("model");
const thinkingButton = element<HTMLButtonElement>("thinking");
const cwdLabel = element<HTMLElement>("cwd");
const status = element<HTMLElement>("status");

const modal = element<HTMLElement>("modal");
const dialogTitle = element<HTMLElement>("dialog-title");
const dialogBody = element<HTMLElement>("dialog-body");
const dialogInput = element<HTMLInputElement>("dialog-input");
const dialogOptions = element<HTMLUListElement>("dialog-options");
const dialogOk = element<HTMLButtonElement>("dialog-ok");
const dialogCancel = element<HTMLButtonElement>("dialog-cancel");

/** The assistant message currently being streamed into, or undefined when idle. */
let streaming: HTMLElement | undefined;
/** The request currently shown, so its answer can be returned to the main process. */
let activeRequest: UiRequest | undefined;

/** Flattens one message's content into plain lines the transcript can show. */
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
	modelButton.textContent = snapshot.model ?? "no model";
	thinkingButton.textContent = snapshot.thinkingLevel ?? "thinking";
	cwdLabel.textContent = snapshot.ready ? "" : "starting…";
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

function closeModal(answer: string | undefined): void {
	modal.hidden = true;
	const request = activeRequest;
	activeRequest = undefined;
	dialogOptions.replaceChildren();
	dialogInput.hidden = true;
	dialogBody.textContent = "";
	if (request) bridge.respond(request.id, answer);
}

function openModal(request: UiRequest): void {
	activeRequest = request;
	modal.hidden = false;

	if (request.kind === "notify" || request.kind === "status") {
		dialogTitle.textContent = "";
		showStatus(request.message || undefined);
		activeRequest = undefined;
		modal.hidden = true;
		return;
	}

	dialogTitle.textContent = request.title;
	dialogBody.textContent = "";
	dialogOptions.replaceChildren();

	if (request.kind === "select") {
		for (const option of request.options) {
			const item = document.createElement("li");
			const button = document.createElement("button");
			button.type = "button";
			button.textContent = option;
			button.addEventListener("click", () => closeModal(option));
			item.append(button);
			dialogOptions.append(item);
		}
	} else if (request.kind === "confirm") {
		dialogBody.textContent = request.message;
	} else {
		dialogInput.hidden = false;
		dialogInput.value = "";
		dialogInput.placeholder = request.placeholder ?? "";
		dialogInput.focus();
	}
}

dialogOk.addEventListener("click", () => {
	const request = activeRequest;
	if (!request) return;
	if (request.kind === "confirm") closeModal("yes");
	else if (request.kind === "input") closeModal(dialogInput.value === "" ? undefined : dialogInput.value);
	else closeModal(undefined);
});
dialogCancel.addEventListener("click", () => closeModal(undefined));
modal.addEventListener("click", (event) => {
	if (event.target === modal) closeModal(undefined);
});

function showStatus(message: string | undefined): void {
	status.textContent = message ?? "";
	status.hidden = message === undefined || message === "";
}

/** Runs a command by name, reporting a failure in the status line rather than a dialog. */
async function runCommand(name: string, args = ""): Promise<void> {
	showStatus(undefined);
	const result = await bridge.runCommand(name, args);
	if (!result.ok && result.error) showStatus(result.error);
	await refresh();
}

async function pickModel(): Promise<void> {
	const models = await bridge.listModels();
	if (models.length === 0) {
		showStatus("No models available. Check your settings.");
		return;
	}
	const chosen = await askSelect(
		"Choose a model",
		models.map((entry) => `${entry.isCurrent ? "* " : ""}${entry.label}`),
	);
	if (chosen === undefined) return;
	const index = models.findIndex((entry) => entry.label === chosen.replace(/^\* /, ""));
	if (index < 0) return;
	const target = models[index]!;
	const result = await bridge.setModel(target.id, target.provider);
	if (!result.ok && result.error) showStatus(result.error);
	await refresh();
}

async function pickThinking(): Promise<void> {
	const levels = await bridge.listThinking();
	if (levels.length === 0) return;
	const chosen = await askSelect("Thinking level", levels);
	if (chosen === undefined) return;
	const result = await bridge.setThinking(chosen);
	if (!result.ok && result.error) showStatus(result.error);
	await refresh();
}

async function showCommands(): Promise<void> {
	const commands = await bridge.listCommands();
	if (commands.length === 0) {
		showStatus("No commands registered.");
		return;
	}
	const labels = commands.map((entry) => `${entry.name}${entry.description ? ` - ${entry.description}` : ""}`);
	const chosen = await askSelect("Run a command", labels);
	if (chosen === undefined) return;
	const index = labels.indexOf(chosen);
	const target = commands[index];
	if (target) await runCommand(target.name);
}

/** A local picker built from the same shapes the modal uses, so there is one code path. */
function askSelect(title: string, options: string[]): Promise<string | undefined> {
	return new Promise((resolve) => {
		activeRequest = { id: "local", kind: "select", title, options };
		modal.hidden = false;
		dialogTitle.textContent = title;
		dialogBody.textContent = "";
		dialogInput.hidden = true;
		dialogOptions.replaceChildren();
		for (const option of options) {
			const item = document.createElement("li");
			const button = document.createElement("button");
			button.type = "button";
			button.textContent = option;
			button.addEventListener("click", () => {
				modal.hidden = true;
				activeRequest = undefined;
				resolve(option);
			});
			item.append(button);
			dialogOptions.append(item);
		}
		const onCancel = () => {
			modal.hidden = true;
			activeRequest = undefined;
			dialogOptions.replaceChildren();
			document.removeEventListener("keydown", onEscape, true);
			resolve(undefined);
		};
		const onEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") onCancel();
		};
		document.addEventListener("keydown", onEscape, true);
		setTimeout(() => document.removeEventListener("keydown", onEscape, true), 60_000);
	});
}

async function submit(): Promise<void> {
	const text = input.value.trim();
	if (text === "") return;

	// A leading slash is a command, not a message. Sending it as a prompt would spend tokens asking the
	// model to explain the text instead of running it.
	if (text.startsWith("/")) {
		const [name, ...rest] = text.slice(1).split(/\s+/);
		if (name) {
			input.value = "";
			resizeInput();
			await runCommand(`/${name}`, rest.join(" "));
			return;
		}
	}

	appendMessage("user", text);
	input.value = "";
	resizeInput();
	showStatus(undefined);
	abortButton.hidden = false;

	const result = await bridge.sendPrompt(text);
	if (!result.ok) {
		showStatus(result.error ?? "The message could not be sent.");
		abortButton.hidden = true;
		await refresh();
	}
}

function resizeInput(): void {
	input.style.height = "auto";
	input.style.height = `${Math.min(input.scrollHeight, 240)}px`;
}

input.addEventListener("input", resizeInput);

/**
 * Attach a pasted image.
 *
 * A browser paste event carries the image bytes on `clipboardData`, not a path, so nothing can be read
 * from a terminal here: the bytes go to the main process, which stores them, and the path goes into the
 * composer. The main process resolves that path into a real attachment when the message is sent, the same
 * way the terminal does it.
 */
input.addEventListener("paste", (event: ClipboardEvent) => {
	const items = event.clipboardData?.items;
	if (!items) return;

	const imageItem = Array.from(items).find((item) => item.kind === "file" && item.type.startsWith("image/"));
	if (!imageItem) return;

	const file = imageItem.getAsFile();
	if (!file) return;

	// The default action would paste nothing useful for an image, so it is suppressed here.
	event.preventDefault();
	void (async () => {
		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			const saved = await bridge.pasteImage(bytes, file.type);
			showStatus(`image attached: ${saved.path}`);
			const before = input.value;
			input.value = before ? `${before} ${saved.path}` : saved.path;
			resizeInput();
		} catch (error) {
			showStatus(`Could not attach the image: ${error instanceof Error ? error.message : String(error)}`);
		}
	})();
});
input.addEventListener("keydown", (event) => {
	if (event.key === "Enter" && !event.shiftKey) {
		event.preventDefault();
		void submit();
	}
});
sendButton.addEventListener("click", () => void submit());
abortButton.addEventListener("click", () => void bridge.abort());
modelButton.addEventListener("click", () => void pickModel());
thinkingButton.addEventListener("click", () => void pickThinking());
commandsButton.addEventListener("click", () => void showCommands());

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

function onEvent(event: DesktopEvent): void {
	switch (event.type) {
		case "delta": {
			if (!streaming) streaming = appendMessage("assistant", "");
			streaming.textContent += event.detail;
			transcript.scrollTop = transcript.scrollHeight;
			return;
		}
		case "ui_request":
			openModal(event.request);
			return;
		case "turn_end":
		case "settled":
			streaming = undefined;
			abortButton.hidden = true;
			void refresh();
			return;
		case "ready":
		case "model_changed":
			void refresh();
			return;
		default:
			return;
	}
}

bridge.onEvent(onEvent);
void refresh();
