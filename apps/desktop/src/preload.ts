/**
 * The preload bridge: the only thing the window can call.
 *
 * Compiled to CommonJS because a sandboxed preload script cannot be an ES module. It exposes exactly the
 * functions declared in `PiBridge` and nothing else, so the renderer never gets an object it can walk into
 * Node's process or the electron module with.
 */

import { contextBridge, ipcRenderer } from "electron";
import { IPC, type DesktopEvent, type PiBridge, type SendPromptResult, type SessionSnapshot } from "./shared.ts";

const bridge: PiBridge = {
	getSnapshot: () => ipcRenderer.invoke(IPC.snapshot) as Promise<SessionSnapshot>,
	sendPrompt: (text) => ipcRenderer.invoke(IPC.sendPrompt, text) as Promise<SendPromptResult>,
	abort: () => ipcRenderer.invoke(IPC.abort) as Promise<void>,
	chooseFolder: () => ipcRenderer.invoke(IPC.chooseFolder) as Promise<string | undefined>,
	setCwd: (cwd) => ipcRenderer.invoke(IPC.setCwd, cwd) as Promise<SendPromptResult>,
	onEvent: (listener) => {
		// The IpcRendererEvent carries a sender handle and must not reach the renderer, so only the payload
		// is forwarded.
		const handler = (_event: unknown, payload: DesktopEvent) => listener(payload);
		ipcRenderer.on(IPC.event, handler);
		return () => ipcRenderer.removeListener(IPC.event, handler);
	},
};

contextBridge.exposeInMainWorld("pi", bridge);
