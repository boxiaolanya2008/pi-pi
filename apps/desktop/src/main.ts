/**
 * Electron main process.
 *
 * This is a shell, not a second implementation: it embeds the same agent through the SDK's
 * `createAgentSession()`, so tools, settings, sessions, extensions, skills, and themes all behave exactly
 * as they do in the terminal.
 *
 * The interesting part is the UI context. Extensions ask for interaction through `ctx.ui`, and the runner
 * takes one per mode via `setUIContext`. Supplying a desktop implementation here is what makes the whole
 * extension command registry work in a window: `/rewind`, `/experts`, `/plan`, and everything registered
 * later run unchanged, because they only ever ask the context. It is why this shell does not carry a
 * second copy of those commands.
 *
 * In-process rather than an RPC child process: one runtime to install and one to debug, and the session's
 * events already carry what the window needs. The trade is that a crash in the agent takes the window with
 * it, which is acceptable at this size.
 */

import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, extname, join } from "node:path";
import { createAgentSession } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "../../../packages/coding-agent/src/config.ts";
import {
	extractImagePaths,
	loadImageAttachments,
} from "../../../packages/coding-agent/src/utils/image-attachments.ts";
import {
	IPC,
	type CommandOption,
	type DesktopEvent,
	type DesktopSignal,
	type ModelOption,
	type PastedImage,
	type SendPromptResult,
	type SessionSnapshot,
	type UiRequest,
	type UiRequestBody,
} from "./shared.ts";
import { askViaWindow, desktopUiBindings, resolveAnswer } from "./ui-context.ts";

const here = dirname(fileURLToPath(import.meta.url));

type Session = Awaited<ReturnType<typeof createAgentSession>>["session"];

/** The live session, or undefined before startup finished. */
let session: Session | undefined;
/** The directory the session was opened in, needed to resolve relative paths from a pasted image. */
let cwd = process.cwd();
let window: BrowserWindow | undefined;

/** Push an event to the window, dropping it entirely when there is none. */
function forward(event: DesktopEvent): void {
	if (!window || window.isDestroyed()) return;
	window.webContents.send(IPC.event, event);
}

/** Send a fully formed request; `askViaWindow` owns the id that an answer refers to. */
function send(request: UiRequest): void {
	forward({ type: "ui_request", request });
}

/** Fire-and-forget notice: the id exists only because the payload shape requires one. */
function publish(body: UiRequestBody): void {
	send({ ...body, id: randomUUID() });
}

function publishSignal(type: DesktopSignal): void {
	forward({ type });
}

/** Extension for a mime type, so the saved file is something the image pipeline will pick up. */
function mimeTypeToExtension(mimeType: string): string {
	switch (mimeType.split(";")[0]?.trim().toLowerCase()) {
		case "image/jpeg":
			return ".jpg";
		case "image/webp":
			return ".webp";
		case "image/gif":
			return ".gif";
		case "image/bmp":
			return ".bmp";
		default:
			return ".png";
	}
}

/** The session's working directory, which is where relative image paths resolve. */
function sessionManagerCwd(): string {
	return cwd;
}

/** Keep only what the window renders, so the IPC payload stays small and stable across SDK versions. */
function snapshot(): SessionSnapshot {
	if (!session) {
		return { ready: false, model: undefined, thinkingLevel: undefined, tools: [], messages: [] };
	}
	return {
		ready: true,
		model: session.model ? `${session.model.provider}/${session.model.id}` : undefined,
		thinkingLevel: session.thinkingLevel,
		tools: session.getActiveToolNames(),
		messages: session.state.messages,
	};
}

/** Models the picker offers, flattened from the SDK's registry shape. */
async function modelOptions(): Promise<ModelOption[]> {
	if (!session) return [];
	const available = await session.modelRuntime.getAvailable();
	const current = session.model;
	return available.map((entry) => ({
		id: entry.id,
		provider: entry.provider,
		label: `${entry.provider}/${entry.id}`,
		isCurrent: entry.id === current?.id && entry.provider === current?.provider,
	}));
}

/**
 * Commands the session can run.
 *
 * Read from the same runner the terminal dispatches through, so a command added by any extension appears
 * here without the shell knowing anything about it.
 */
function commandOptions(): CommandOption[] {
	const runner = session?.extensionRunner;
	if (!runner) return [];
	return runner
		.getRegisteredCommands()
		.map((command) => ({
			name: command.invocationName,
			...(command.description ? { description: command.description } : {}),
			source: command.sourceInfo?.source ?? "extension",
		}));
}

async function startSession(target: string): Promise<void> {
	session?.dispose();
	session = undefined;
	cwd = target;

	const created = await createAgentSession({ cwd: target });
	session = created.session;

	// Two steps, and the order matters. `bindExtensions` injects the UI context and emits session_start,
	// which is what loads the resources extensions provide. The runner must exist first, and the desktop
	// context has to be in place before any command handler can ask the user something.
	const runner = session.extensionRunner;
	runner.setUIContext(desktopUiBindings(publish, askViaWindow(send)) as never, "tui");
	await session.bindExtensions({ uiContext: desktopUiBindings(publish, askViaWindow(send)) as never, mode: "tui" });

	session.subscribe((event) => {
		switch (event.type) {
			case "message_update":
				if (event.assistantMessageEvent.type === "text_delta") {
					forward({ type: "delta", detail: event.assistantMessageEvent.delta });
				}
				return;
			case "agent_end":
				publishSignal("turn_end");
				return;
			case "agent_settled":
				publishSignal("settled");
				return;
			default:
				return;
		}
	});

	publishSignal("ready");
}

async function createWindow(): Promise<void> {
	window = new BrowserWindow({
		width: 1180,
		height: 820,
		minWidth: 720,
		minHeight: 520,
		backgroundColor: "#12100e",
		title: "Pi-Pi",
		webPreferences: {
			// The renderer is untrusted: it gets a narrow, explicitly declared bridge and no Node access.
			preload: join(here, "preload.cjs"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});

	// Never let the window navigate away from the bundled UI, and send real links to the real browser.
	window.webContents.setWindowOpenHandler(({ url }) => {
		if (url.startsWith("https://")) void shell.openExternal(url);
		return { action: "deny" };
	});

	await window.loadFile(join(here, "renderer", "index.html"));
}

/**
 * Startup probe used by `scripts/smoke.mjs`.
 *
 * A passing build proves nothing on its own: this is the only check that the real Electron runtime boots,
 * that the SDK loads inside it, and that the renderer actually painted. Active only when
 * `PI_DESKTOP_SMOKE` is set, so a normal launch never writes a file or quits.
 */
async function runSmokeProbe(): Promise<void> {
	const result: {
		windowCreated: boolean;
		rendererPainted: boolean;
		sessionReady: boolean;
		toolCount: number;
		commandCount: number;
		modelCount: number;
		error?: string;
	} = { windowCreated: false, rendererPainted: false, sessionReady: false, toolCount: 0, commandCount: 0, modelCount: 0 };
	const target = join(here, ".smoke-result.json");

	try {
		result.windowCreated = window !== undefined;
		const active = window;
		if (active) {
			await new Promise<void>((resolve) => {
				if (!active.webContents.isLoading()) return resolve();
				active.webContents.once("did-finish-load", () => resolve());
			});
			result.rendererPainted = await active.webContents.executeJavaScript(
				"Boolean(document.querySelector('#transcript') && document.querySelector('#input'))",
			);
		}

		result.sessionReady = session !== undefined;
		result.toolCount = session?.getActiveToolNames().length ?? 0;
		result.commandCount = commandOptions().length;
		result.modelCount = (await modelOptions()).length;
	} catch (error) {
		result.error = error instanceof Error ? error.message : String(error);
	}

	writeFileSync(target, JSON.stringify(result), "utf-8");
	app.exit(0);
}

function registerIpc(): void {
	ipcMain.handle(IPC.snapshot, () => snapshot());

	ipcMain.handle(IPC.listCommands, () => commandOptions());

	ipcMain.handle(IPC.listModels, () => modelOptions());

	ipcMain.handle(IPC.listThinking, () => session?.getAvailableThinkingLevels() ?? []);

	ipcMain.handle(IPC.setModel, async (_event, id: unknown, provider: unknown): Promise<SendPromptResult> => {
		if (!session || typeof id !== "string" || typeof provider !== "string") {
			return { ok: false, error: "No session, or an invalid model." };
		}
		try {
			await session.setModel({ provider, id } as never);
			publishSignal("model_changed");
			return { ok: true };
		} catch (error) {
			return { ok: false, error: error instanceof Error ? error.message : String(error) };
		}
	});

	ipcMain.handle(IPC.setThinking, async (_event, level: unknown): Promise<SendPromptResult> => {
		if (!session || typeof level !== "string") return { ok: false, error: "No session." };
		try {
			await session.setThinkingLevel(level as never);
			publishSignal("model_changed");
			return { ok: true };
		} catch (error) {
			return { ok: false, error: error instanceof Error ? error.message : String(error) };
		}
	});

	/**
	 * Run a registered command by name.
	 *
	 * The runner exposes `getCommand(name)`, which is the same lookup the terminal dispatcher uses. Only
	 * commands whose handler needs nothing beyond the shared context can run here; a handler that expects
	 * a fully bound interactive command context will report that rather than half-run.
	 */
	ipcMain.handle(IPC.runCommand, async (_event, name: unknown, args: unknown): Promise<SendPromptResult> => {
		if (!session || typeof name !== "string") return { ok: false, error: "No session." };
		const entry = session.extensionRunner.getCommand(name);
		if (!entry) return { ok: false, error: `Unknown command: ${name}` };
		try {
			await entry.handler(typeof args === "string" ? args : "", session as never);
			publishSignal("settled");
			return { ok: true };
		} catch (error) {
			return { ok: false, error: error instanceof Error ? error.message : String(error) };
		}
	});

	/**
	 * Store a pasted image.
	 *
	 * A window receives pasted image bytes, not a path, so it has to land somewhere the agent can read.
	 * It goes under the agent directory rather than the project: a screenshot pasted into a conversation is
	 * not a file the user asked to create in their repository.
	 */
	ipcMain.handle(IPC.pasteImage, async (_event, data: unknown, mimeType: unknown): Promise<PastedImage> => {
		if (!(data instanceof Uint8Array) || typeof mimeType !== "string") {
			throw new Error("Expected image bytes and a mime type.");
		}
		const directory = join(getAgentDir(), "pastes");
		mkdirSync(directory, { recursive: true });
		const path = join(directory, `paste-${randomUUID()}${extname(`x${mimeTypeToExtension(mimeType)}`) || ".png"}`);
		writeFileSync(path, data);
		return { path, mimeType, bytes: data.length };
	});

	ipcMain.handle(IPC.sendPrompt, async (_event, text: string): Promise<SendPromptResult> => {
		if (!session) return { ok: false, error: "The agent is not ready yet." };
		if (typeof text !== "string" || text.trim() === "") return { ok: false, error: "The message is empty." };
		try {
			// A pasted image arrives as a path in the text. Resolve it the same way the terminal does, so
			// the model sees the picture rather than a filename.
			const { text: remaining, paths } = extractImagePaths(text, sessionManagerCwd());
			if (paths.length === 0) {
				await session.prompt(text);
				return { ok: true };
			}

			const { images, failures } = await loadImageAttachments(paths, {
				autoResizeImages: true,
			});
			for (const failure of failures) {
				forward({
					type: "ui_request",
					request: {
						id: randomUUID(),
						kind: "notify",
						level: "warning",
						message: `Could not attach ${failure.path}: ${failure.message}`,
					},
				});
			}
			if (images.length === 0) {
				await session.prompt(text);
				return { ok: true };
			}
			await session.prompt(remaining || "(image attached)", { images });
			return { ok: true };
		} catch (error) {
			return { ok: false, error: error instanceof Error ? error.message : String(error) };
		}
	});

	ipcMain.handle(IPC.abort, async () => {
		await session?.abort();
	});

	// `respond` arrives from the renderer with `send`, so it is an `on` handler, not `invoke`.
	ipcMain.on(IPC.respond, (_event, id: unknown, value: unknown) => {
		if (typeof id === "string") resolveAnswer(id, typeof value === "string" ? value : undefined);
	});
	ipcMain.handle(IPC.chooseFolder, async () => {
		if (!window) return undefined;
		const result = await dialog.showOpenDialog(window, { properties: ["openDirectory"] });
		return result.canceled ? undefined : result.filePaths[0];
	});

	ipcMain.handle(IPC.setCwd, async (_event, cwd: string) => {
		if (typeof cwd !== "string" || cwd === "") return { ok: false, error: "No folder selected." };
		try {
			await startSession(cwd);
			return { ok: true };
		} catch (error) {
			return { ok: false, error: error instanceof Error ? error.message : String(error) };
		}
	});
}

app.whenReady().then(async () => {
	registerIpc();
	await createWindow();
	// Start in the directory the app was launched from, which is what a terminal user would expect.
	await startSession(process.cwd());
	// Probed after the session exists, because that is the thing worth proving.
	if (process.env.PI_DESKTOP_SMOKE) await runSmokeProbe();

	app.on("activate", async () => {
		if (BrowserWindow.getAllWindows().length === 0) await createWindow();
	});
});

app.on("window-all-closed", () => {
	session?.dispose();
	if (process.platform !== "darwin") app.quit();
});
