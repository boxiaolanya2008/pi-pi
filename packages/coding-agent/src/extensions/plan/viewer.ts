/**
 * Plan extension viewers: todo list dialog and the line-level plan editor.
 */

import { Container, getKeybindings, Input, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import type { Theme } from "../../modes/interactive/theme/theme.ts";

interface Todo {
	id: number;
	text: string;
	done: boolean;
}

/** Dialog listing the branch's todos. Escape or Ctrl+C closes. */
export class TodoListComponent extends Container {
	private todos: Todo[];
	private theme: Theme;
	private onClose: () => void;
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(todos: Todo[], theme: Theme, onClose: () => void) {
		super();
		this.todos = todos;
		this.theme = theme;
		this.onClose = onClose;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.onClose();
		}
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const lines: string[] = [];
		const th = this.theme;

		lines.push("");
		const title = th.fg("accent", " Todos ");
		const headerLine =
			th.fg("borderMuted", "─".repeat(3)) + title + th.fg("borderMuted", "─".repeat(Math.max(0, width - 10)));
		lines.push(truncateToWidth(headerLine, width));
		lines.push("");

		if (this.todos.length === 0) {
			lines.push(truncateToWidth(`  ${th.fg("dim", "No todos yet. Ask the agent to add some!")}`, width));
		} else {
			const done = this.todos.filter((t) => t.done).length;
			const total = this.todos.length;
			lines.push(truncateToWidth(`  ${th.fg("muted", `${done}/${total} completed`)}`, width));
			lines.push("");

			for (const todo of this.todos) {
				const check = todo.done ? th.fg("success", "✓") : th.fg("dim", "○");
				const id = th.fg("accent", `#${todo.id}`);
				const text = todo.done ? th.fg("dim", todo.text) : th.fg("text", todo.text);
				lines.push(truncateToWidth(`  ${check} ${id} ${text}`, width));
			}
		}

		lines.push("");
		lines.push(truncateToWidth(`  ${th.fg("dim", "Press Escape to close")}`, width));
		lines.push("");

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}

interface LineChange {
	lineIndex: number;
	oldText: string;
}

/**
 * Line-level plan editor: pick a line, describe the change, the model rewrites
 * that line only. Changes are applied to the in-memory doc and written back by
 * `onApply`; Ctrl+Z reverts the last change (and re-applies via `onApply`).
 */
export class PlanLineEditor extends Container {
	private lines: string[];
	private readonly title: string;
	private readonly theme: Theme;
	private readonly onClose: () => void;
	private readonly onApply: (lines: string[]) => void;
	private readonly onRewriteLine: (
		doc: string[],
		lineIndex: number,
		instruction: string,
	) => Promise<string | undefined>;
	private readonly onError: (message: string) => void;

	private selectedIndex = 0;
	private editing = false;
	private waiting = false;
	private input: Input | undefined;
	private history: LineChange[] = [];
	private status: string | undefined;

	constructor(
		lines: string[],
		title: string,
		theme: Theme,
		handlers: {
			onClose: () => void;
			onApply: (lines: string[]) => void;
			onRewriteLine: (doc: string[], lineIndex: number, instruction: string) => Promise<string | undefined>;
			onError: (message: string) => void;
		},
	) {
		super();
		this.lines = lines;
		this.title = title;
		this.theme = theme;
		this.onClose = handlers.onClose;
		this.onApply = handlers.onApply;
		this.onRewriteLine = handlers.onRewriteLine;
		this.onError = handlers.onError;
	}

	handleInput(data: string): void {
		const kb = getKeybindings();
		if (this.editing && this.input) {
			if (kb.matches(data, "tui.select.cancel")) {
				this.editing = false;
				this.input = undefined;
				this.renderNow();
				return;
			}
			if (kb.matches(data, "tui.input.submit") || data === "\n" || data === "\r") {
				const instruction = this.input.getValue().trim();
				const lineIndex = this.selectedIndex;
				this.editing = false;
				this.input = undefined;
				if (instruction) void this.applyModelEdit(lineIndex, instruction);
				this.renderNow();
				return;
			}
			this.input.handleInput(data);
			this.renderNow();
			return;
		}

		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.onClose();
			return;
		}
		if (kb.matches(data, "tui.editor.undo")) {
			this.undo();
			return;
		}
		if (kb.matches(data, "tui.select.up") || data === "k") {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
			this.renderNow();
		} else if (kb.matches(data, "tui.select.down") || data === "j") {
			this.selectedIndex = Math.min(this.lines.length - 1, this.selectedIndex + 1);
			this.renderNow();
		} else if (kb.matches(data, "tui.select.confirm") || data === "\n" || data === "\r") {
			this.editing = true;
			this.input = new Input({ prompt: "change> ", placeholder: "Describe the change for this line" });
			this.input.focused = true;
			this.renderNow();
		}
	}

	render(width: number): string[] {
		const th = this.theme;
		const lines: string[] = [];
		lines.push("");
		lines.push(truncateToWidth(th.fg("accent", th.bold(` ${this.title} `)), width));
		lines.push(truncateToWidth(th.fg("dim", "↑↓ select line · Enter edit · Ctrl+Z undo · Esc close"), width));
		lines.push("");
		for (let i = 0; i < this.lines.length; i++) {
			const selected = i === this.selectedIndex;
			const prefix = selected ? th.fg("accent", "→ ") : "  ";
			const num = th.fg("muted", `${String(i + 1).padStart(3)} `);
			const body = selected ? th.fg("accent", this.lines[i]) : th.fg("text", this.lines[i]);
			lines.push(truncateToWidth(`${prefix}${num}${body}`, width));
		}
		lines.push("");
		if (this.waiting) lines.push(truncateToWidth(th.fg("accent", "Model is rewriting the line..."), width));
		if (this.status) lines.push(truncateToWidth(th.fg("success", this.status), width));
		if (this.editing && this.input) lines.push(...this.input.render(width));
		return lines;
	}

	invalidate(): void {
		// No cached render state; rebuilt per render call.
	}

	private async applyModelEdit(lineIndex: number, instruction: string): Promise<void> {
		this.waiting = true;
		this.status = undefined;
		this.renderNow();
		try {
			const replacement = await this.onRewriteLine(this.lines, lineIndex, instruction);
			this.waiting = false;
			if (replacement === undefined) {
				this.renderNow();
				return;
			}
			this.history.push({ lineIndex, oldText: this.lines[lineIndex] });
			this.lines[lineIndex] = replacement;
			this.onApply(this.lines);
			this.status = `Line ${lineIndex + 1} updated. Ctrl+Z to revert.`;
		} catch (error) {
			this.waiting = false;
			this.onError(error instanceof Error ? error.message : String(error));
		}
		this.renderNow();
	}

	private undo(): void {
		const change = this.history.pop();
		if (!change) {
			this.status = "Nothing to undo.";
			this.renderNow();
			return;
		}
		this.lines[change.lineIndex] = change.oldText;
		this.onApply(this.lines);
		this.status = `Reverted line ${change.lineIndex + 1}.`;
		this.renderNow();
	}

	private renderNow(): void {
		this.invalidate();
	}
}
