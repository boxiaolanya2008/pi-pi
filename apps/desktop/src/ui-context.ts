/**
 * A desktop implementation of the extension UI context.
 *
 * `ExtensionUIContext` is the documented seam for this: `ExtensionRunner.setUIContext()` accepts one per
 * mode, and RPC and print mode already pass a context whose terminal-shaped methods do nothing. Here the
 * interactive parts (`select`, `confirm`, `notify`, status text) travel to the window over IPC, and the
 * TUI-shaped parts are inert, because a window has nowhere to draw a `Component` factory.
 *
 * Injecting this rather than special-casing commands is what makes `/rewind`, `/experts`, `/plan`,
 * `/todos`, and every future `registerCommand` work unchanged. A command that calls `ctx.ui.select` keeps
 * its code; only where the answer comes from differs.
 */

import { randomUUID } from "node:crypto";
import type { UiRequest, UiRequestBody } from "./shared.ts";

/** Sends a question to the window and resolves when it answers. */
export type Ask = (request: UiRequestBody) => Promise<string | undefined>;

/** Publishes a notice the window shows without waiting for an answer. */
type Publish = (request: UiRequestBody) => void;

/** Pending questions, keyed by id so an answer reaches the right waiter. */
const pending = new Map<string, (value: string | undefined) => void>();

/** Status lines extensions set, replayed to the window after a reload. */
const statusByKey = new Map<string, string>();

/**
 * Ask the window something.
 *
 * `notify` never waits: it is fire-and-forget, and treating it as a question would leave a promise that
 * nothing resolves.
 */
export function askViaWindow(send: (request: UiRequest) => void): Ask {	return (request) => {
		if (request.kind === "notify") {
			send({ ...request, id: randomUUID() });
			return Promise.resolve(undefined);
		}
		return new Promise((resolve) => {
			const id = randomUUID();
			pending.set(id, resolve);
			send({ ...request, id });
		});
	};
}

/** Resolve a question the window just answered, or dismiss it when the value is absent. */
export function resolveAnswer(id: string, value: string | undefined): void {
	const resolve = pending.get(id);
	if (resolve) {
		pending.delete(id);
		resolve(value);
	}
}

/** Status lines currently set, so the window can restore them after a reload. */
export function statusEntries(): [string, string][] {
	return [...statusByKey];
}

/**
 * The bindings handed to `setUIContext`.
 *
 * The interface has about thirty members, most of them shaped around a terminal `Component` factory. They
 * are present and inert rather than missing: a command that reaches one gets a defined no-op instead of a
 * crash, and it can still do its real work through the rest of the context.
 */
export function desktopUiBindings(publish: Publish, ask: Ask): Record<string, unknown> {
	return {
		select(title: string, options: string[]): Promise<string | undefined> {
			if (options.length === 0) return Promise.resolve(undefined);
			return ask({ kind: "select", title, options });
		},

		confirm(title: string, message: string): Promise<boolean> {
			return ask({ kind: "confirm", title, message }).then((value) => value !== undefined);
		},

		/**
		 * Text entry is rendered as a single-option prompt carrying the placeholder, so the window needs one
		 * code path rather than two. An empty answer is a cancellation, not an empty string.
		 */
		input(title: string, placeholder?: string): Promise<string | undefined> {
			return ask({ kind: "input", title, placeholder }).then((value) =>
				value === undefined || value === placeholder ? undefined : value,
			);
		},

		notify(message: string, level: "info" | "warning" | "error" = "info"): void {
			publish({ kind: "notify", level, message });
		},

		setStatus(key: string, text: string | undefined): void {
			if (text === undefined) statusByKey.delete(key);
			else statusByKey.set(key, text);
			publish({ kind: "status", level: "info", message: text ?? "" });
		},

		setTitle(title: string): void {
			publish({ kind: "status", level: "info", message: title });
		},

		// Terminal-shaped methods. A window cannot host a terminal component factory, and failing loudly
		// here would break a command whose real work is elsewhere.
		onTerminalInput: () => () => {},
		setWorkingMessage: () => {},
		setWorkingVisible: () => {},
		setWorkingIndicator: () => {},
		setHiddenThinkingLabel: () => {},
		setWidget: () => {},
		setFooter: () => {},
		setHeader: () => {},
		custom: () => Promise.resolve(undefined),
		editor: () => Promise.resolve(undefined),
		addAutocompleteProvider: () => {},
		setEditorComponent: () => {},
		getEditorComponent: () => undefined,
		getEditorText: () => "",
		setEditorText: () => {},
		pasteToEditor: () => {},
		getAllThemes: () => [],
		getTheme: () => undefined,
		setTheme: () => ({ success: false, error: "Themes are a terminal feature." }),
		getToolsExpanded: () => false,
		setToolsExpanded: () => {},
	};
}
