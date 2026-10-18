/**
 * The preload bridge: the only thing the window can call.
 *
 * Compiled to CommonJS because a sandboxed preload script cannot be an ES module. It exposes exactly the
 * functions declared in `PiBridge` and nothing else, so the renderer never gets an object it can walk into
 * Node's process or the electron module with.
 */

import { contextBridge, ipcRenderer } from "electron";
import {
	IPC,
	type CommandOption,
	type DesktopEvent,
	type ModelOption,
	type PastedImage,
	type PiBridge,
	type SendPromptResult,
	type SessionSnapshot,
} from "./shared.ts";

const bridge: PiBridge = {
	getSnapshot: () => ipcRenderer.invoke(IPC.snapshot) as Promise<SessionSnapshot>,
	sendPrompt: (text) => ipcRenderer.invoke(IPC.sendPrompt, text) as Promise<SendPromptResult>,
	abort: () => ipcRenderer.invoke(IPC.abort) as Promise<void>,
	chooseFolder: () => ipcRenderer.invoke(IPC.chooseFolder) as Promise<string | undefined>,
	setCwd: (cwd) => ipcRenderer.invoke(IPC.setCwd, cwd) as Promise<SendPromptResult>,
	listCommands: () => ipcRenderer.invoke(IPC.listCommands) as Promise<CommandOption[]>,
	runCommand: (name, args) => ipcRenderer.invoke(IPC.runCommand, name, args) as Promise<SendPromptResult>,
	listModels: () => ipcRenderer.invoke(IPC.listModels) as Promise<ModelOption[]>,
	setModel: (id, provider) => ipcRenderer.invoke(IPC.setModel, id, provider) as Promise<SendPromptResult>,
	listThinking: () => ipcRenderer.invoke(IPC.listThinking) as Promise<string[]>,
	setThinking: (level) => ipcRenderer.invoke(IPC.setThinking, level) as Promise<SendPromptResult>,
	pasteImage: (data, mimeType) =>
		ipcRenderer.invoke(IPC.pasteImage, data, mimeType) as Promise<PastedImage>,
	respond: (id, value) => {
		ipcRenderer.send(IPC.respond, id, value);
	},
	onEvent: (listener) => {
		// The IpcRendererEvent carries a sender handle and must not reach the renderer, so only the payload
		// is forwarded.
		const handler = (_event: unknown, payload: DesktopEvent) => listener(payload);
		ipcRenderer.on(IPC.event, handler);
		return () => ipcRenderer.removeListener(IPC.event, handler);
	},
};

contextBridge.exposeInMainWorld("pi", bridge);
