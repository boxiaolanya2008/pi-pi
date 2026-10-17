/**
 * Electron main process.
 *
 * This is a shell, not a second implementation: it embeds the same agent through the SDK's
 * `createAgentSession()`, so tools, settings, sessions, extensions, skills, and themes all behave exactly
 * as they do in the terminal. The renderer never touches that API directly; everything crosses a narrow
 * IPC surface declared in `shared.ts`.
 *
 * In-process rather than an RPC child process: there is one runtime to install and one to debug, and the
 * session's events already carry everything the window needs. The trade is that a crash in the agent takes
 * the window with it, which is acceptable while the surface this small.
 */

import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createAgentSession } from "@earendil-works/pi-coding-agent";
import { IPC, type DesktopEvent, type DesktopSignal, type SendPromptResult, type SessionSnapshot } from "./shared.ts";

const here = dirname(fileURLToPath(import.meta.url));

/** The live session, or undefined before startup finished. */
let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
let window: BrowserWindow | undefined;

/** Forward a session event to the window, dropping anything that is not serializable for IPC. */
function forward(event: DesktopEvent): void {
	if (!window || window.isDestroyed()) return;
	window.webContents.send(IPC.event, event);
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

/**
 * Publish a change. Events arrive far more often than the window needs a full transcript, so the window is
 * told to re-read the snapshot on demand instead of receiving the whole conversation every frame.
 */
function publish(type: DesktopSignal): void {
	forward({ type });
}

async function startSession(cwd: string): Promise<void> {
	session?.dispose();
	session = undefined;

	const created = await createAgentSession({ cwd });
	session = created.session;

	// The SDK emits deltas for streaming and whole messages when a turn settles; the window re-reads the
	// transcript on the latter and appends text on the former.
	session.subscribe((event) => {
		switch (event.type) {
			case "message_update":
				if (event.assistantMessageEvent.type === "text_delta") {
					forward({ type: "delta", detail: event.assistantMessageEvent.delta });
				}
				return;
			case "agent_end":
				publish("turn_end");
				return;
			case "agent_settled":
				publish("settled");
				return;
			default:
				return;
		}
	});

	publish("ready");
}

async function createWindow(): Promise<void> {
	window = new BrowserWindow({
		width: 1100,
		height: 780,
		minWidth: 640,
		minHeight: 480,
		backgroundColor: "#12100e",
		title: "Pi",
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
 * It exists because a build passing means nothing on its own: this is the only check that the real
 * Electron runtime boots, that the SDK loads inside it, and that the renderer actually painted. Active
 * only when `PI_DESKTOP_SMOKE` is set, so a normal launch never writes a file or quits.
 */
async function runSmokeProbe(): Promise<void> {
	const result: {
		windowCreated: boolean;
		rendererPainted: boolean;
		sessionReady: boolean;
		toolCount: number;
		error?: string;
	} = { windowCreated: false, rendererPainted: false, sessionReady: false, toolCount: 0 };
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
	} catch (error) {
		result.error = error instanceof Error ? error.message : String(error);
	}

	writeFileSync(target, JSON.stringify(result), "utf-8");
	app.exit(0);
}

function registerIpc(): void {
	ipcMain.handle(IPC.snapshot, () => snapshot());

	ipcMain.handle(IPC.sendPrompt, async (_event, text: string): Promise<SendPromptResult> => {
		if (!session) return { ok: false, error: "The agent is not ready yet." };
		if (typeof text !== "string" || text.trim() === "") return { ok: false, error: "The message is empty." };
		try {
			await session.prompt(text);
			return { ok: true };
		} catch (error) {
			return { ok: false, error: error instanceof Error ? error.message : String(error) };
		}
	});

	ipcMain.handle(IPC.abort, async () => {
		await session?.abort();
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
