/**
 * Plan mode extension.
 *
 * `/plan <topic>` drafts a Markdown plan with the current model, saves it under
 * `~/pipi/plan/--工作区example--/`, and — only after the user confirms — creates a
 * TODO list from the plan's checklist items. TODO state lives in tool results and
 * custom entries on the session branch, so branching restores the right state.
 *
 * The `todo` tool lets the model manage the same list; `/todos` opens the viewer.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "../../core/extensions/types.ts";
import { planDir, savePlanDoc } from "./plan-doc.ts";
import { PlanLineEditor, TodoListComponent } from "./viewer.ts";

interface Todo {
	id: number;
	text: string;
	done: boolean;
}

interface TodoDetails {
	action: "list" | "add" | "toggle" | "clear";
	todos: Todo[];
	nextId: number;
	error?: string;
}

const TodoParams = Type.Object({
	action: StringEnum(["list", "add", "toggle", "clear"] as const),
	text: Type.Optional(Type.String({ description: "Todo text (for add)" })),
	id: Type.Optional(Type.Number({ description: "Todo ID (for toggle)" })),
});

const TODO_ENTRY_TYPE = "plan-todos";
const PLAN_RESULT_TYPE = "plan-mode-result";

const PLAN_DRAFT_SYSTEM_PROMPT = `You draft implementation plans. Output ONLY a Markdown document:
a one-line title, a short goal paragraph, then a "## Steps" section with an unchecked
Markdown checklist item per step ("- [ ] Step description"). Steps are concrete and ordered.
No extra sections, no prose after the checklist. Answer in the language of the topic.`;

export default function planExtension(pi: ExtensionAPI): void {
	let todos: Todo[] = [];
	let nextId = 1;

	/** Reconstruct state from the active branch: custom entries and todo tool results, in order. */
	const reconstructState = (ctx: ExtensionContext) => {
		todos = [];
		nextId = 1;
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "custom" && (entry as { customType?: string }).customType === TODO_ENTRY_TYPE) {
				const data = (entry as { data?: { todos?: Todo[]; nextId?: number } }).data;
				if (data) {
					todos = data.todos ?? [];
					nextId = data.nextId ?? 1;
				}
				continue;
			}
			if (entry.type !== "message") continue;
			const msg = (entry as { message?: { role?: string; toolName?: string; details?: TodoDetails } }).message;
			if (msg?.role !== "toolResult" || msg.toolName !== "todo") continue;
			const details = msg.details;
			if (details) {
				todos = details.todos;
				nextId = details.nextId;
			}
		}
	};

	const persistTodos = () => pi.appendEntry(TODO_ENTRY_TYPE, { todos, nextId });

	function updateWidgets(ctx: ExtensionContext): void {
		const th = ctx.ui.theme;
		if (todos.length > 0) {
			const done = todos.filter((t) => t.done).length;
			ctx.ui.setStatus("plan", th.fg("accent", `todos ${done}/${todos.length}`));
			ctx.ui.setWidget(
				"plan-todos",
				todos.map((t) =>
					t.done
						? th.fg("success", "☑ ") + th.fg("muted", th.strikethrough(t.text))
						: th.fg("muted", "☐ ") + th.fg("text", t.text),
				),
			);
		} else {
			ctx.ui.setStatus("plan", undefined);
			ctx.ui.setWidget("plan-todos", undefined);
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		reconstructState(ctx);
		updateWidgets(ctx);
	});
	pi.on("session_tree", async (_event, ctx) => {
		reconstructState(ctx);
		updateWidgets(ctx);
	});

	// LLM-facing todo tool (state reconstructed from branch history).
	pi.registerTool({
		name: "todo",
		label: "Todo",
		description: "Manage a todo list. Actions: list, add (text), toggle (id), clear",
		parameters: TodoParams,

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			switch (params.action) {
				case "list":
					return {
						content: [
							{
								type: "text",
								text: todos.length
									? todos.map((t) => `[${t.done ? "x" : " "}] #${t.id}: ${t.text}`).join("\n")
									: "No todos",
							},
						],
						details: { action: "list", todos: [...todos], nextId } as TodoDetails,
					};
				case "add": {
					if (!params.text) {
						return {
							content: [{ type: "text", text: "Error: text required for add" }],
							details: { action: "add", todos: [...todos], nextId, error: "text required" } as TodoDetails,
						};
					}
					const newTodo: Todo = { id: nextId++, text: params.text, done: false };
					todos.push(newTodo);
					return {
						content: [{ type: "text", text: `Added todo #${newTodo.id}: ${newTodo.text}` }],
						details: { action: "add", todos: [...todos], nextId } as TodoDetails,
					};
				}
				case "toggle": {
					if (params.id === undefined) {
						return {
							content: [{ type: "text", text: "Error: id required for toggle" }],
							details: { action: "toggle", todos: [...todos], nextId, error: "id required" } as TodoDetails,
						};
					}
					const todo = todos.find((t) => t.id === params.id);
					if (!todo) {
						return {
							content: [{ type: "text", text: `Todo #${params.id} not found` }],
							details: {
								action: "toggle",
								todos: [...todos],
								nextId,
								error: `#${params.id} not found`,
							} as TodoDetails,
						};
					}
					todo.done = !todo.done;
					return {
						content: [{ type: "text", text: `Todo #${todo.id} ${todo.done ? "completed" : "uncompleted"}` }],
						details: { action: "toggle", todos: [...todos], nextId } as TodoDetails,
					};
				}
				case "clear": {
					const count = todos.length;
					todos = [];
					nextId = 1;
					return {
						content: [{ type: "text", text: `Cleared ${count} todos` }],
						details: { action: "clear", todos: [], nextId: 1 } as TodoDetails,
					};
				}
			}
		},

		renderCall(args, theme, _context) {
			let text = theme.fg("toolTitle", theme.bold("todo ")) + theme.fg("muted", args.action);
			if (args.text) text += ` ${theme.fg("dim", `"${args.text}"`)}`;
			if (args.id !== undefined) text += ` ${theme.fg("accent", `#${args.id}`)}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme, _context) {
			const details = result.details as TodoDetails | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}
			if (details.error) {
				return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
			}
			const list = details.todos;
			switch (details.action) {
				case "list": {
					if (list.length === 0) return new Text(theme.fg("dim", "No todos"), 0, 0);
					let listText = theme.fg("muted", `${list.length} todo(s):`);
					const display = expanded ? list : list.slice(0, 5);
					for (const t of display) {
						const check = t.done ? theme.fg("success", "✓") : theme.fg("dim", "○");
						listText += `\n${check} ${theme.fg("accent", `#${t.id}`)} ${t.done ? theme.fg("dim", t.text) : theme.fg("muted", t.text)}`;
					}
					if (!expanded && list.length > 5) {
						listText += `\n${theme.fg("dim", `... ${list.length - 5} more`)}`;
					}
					return new Text(listText, 0, 0);
				}
				case "add": {
					const added = list[list.length - 1];
					return new Text(
						theme.fg("success", "✓ Added ") +
							theme.fg("accent", `#${added.id}`) +
							" " +
							theme.fg("muted", added.text),
						0,
						0,
					);
				}
				case "toggle": {
					const text = result.content[0];
					const msg = text?.type === "text" ? text.text : "";
					return new Text(theme.fg("success", "✓ ") + theme.fg("muted", msg), 0, 0);
				}
				case "clear":
					return new Text(theme.fg("success", "✓ ") + theme.fg("muted", "Cleared all todos"), 0, 0);
			}
		},
	});

	// User-facing viewers.
	pi.registerCommand("todos", {
		description: "Show all todos on the current branch",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/todos requires interactive mode", "error");
				return;
			}
			await ctx.ui.custom<void>((_tui, theme, _kb, done) => new TodoListComponent(todos, theme, done));
		},
	});

	pi.registerCommand("plan", {
		description: "Draft a plan document and optionally create todos from it",
		handler: async (args, ctx) => {
			const topic = args.trim();
			if (!topic) {
				ctx.ui.notify("Usage: /plan <topic>", "info");
				return;
			}
			if (!ctx.model) {
				ctx.ui.notify("No model selected. Configure a model first.", "error");
				return;
			}
			if (!ctx.isIdle()) {
				ctx.ui.notify("Wait for the current run to finish before planning.", "error");
				return;
			}

			ctx.ui.setStatus("plan", ctx.ui.theme.fg("accent", "drafting plan..."));
			let markdown: string;
			try {
				const stream = ctx.modelRegistry.streamSimple(
					ctx.model,
					{
						systemPrompt: PLAN_DRAFT_SYSTEM_PROMPT,
						messages: [{ role: "user", content: topic, timestamp: Date.now() }],
					},
					{ signal: ctx.signal },
				);
				const message = await stream.result();
				markdown = message.content
					.filter((c) => c.type === "text")
					.map((c) => c.text)
					.join("\n")
					.trim();
			} catch (error) {
				ctx.ui.setStatus("plan", undefined);
				ctx.ui.notify(`Plan draft failed: ${error instanceof Error ? error.message : String(error)}`, "error");
				return;
			}
			ctx.ui.setStatus("plan", undefined);
			if (!markdown) {
				ctx.ui.notify("The model returned an empty plan.", "error");
				return;
			}

			let docPath: string;
			try {
				docPath = savePlanDoc(topic, markdown);
			} catch (error) {
				ctx.ui.notify(
					`Failed to save plan document: ${error instanceof Error ? error.message : String(error)}`,
					"error",
				);
				return;
			}

			pi.sendMessage(
				{
					customType: PLAN_RESULT_TYPE,
					content: `## Plan: ${topic}\n\n${markdown}\n\nSaved to \`${docPath}\``,
					display: true,
				},
				{ triggerTurn: false },
			);

			// Nothing is created until the user confirms.
			const choice = await ctx.ui.select("Generate TODO list from this plan?", [
				"Yes, create todos",
				"No, keep the plan only",
			]);
			if (choice !== "Yes, create todos") return;

			todos = parseChecklist(markdown).map((text, i) => ({ id: i + 1, text, done: false }));
			nextId = todos.length + 1;
			if (todos.length === 0) {
				ctx.ui.notify("The plan has no checklist items; no todos created.", "info");
				return;
			}
			persistTodos();
			updateWidgets(ctx);
			ctx.ui.notify(`Created ${todos.length} todos from the plan.`, "info");
		},
	});

	pi.registerCommand("plans", {
		description: "Browse saved plan documents and edit lines with the model",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/plans requires interactive mode", "error");
				return;
			}
			const dir = planDir();
			let files: string[] = [];
			try {
				files = readdirSync(dir)
					.filter((f) => f.endsWith(".md"))
					.sort()
					.reverse();
			} catch {
				ctx.ui.notify("No saved plans yet. Use /plan <topic> to draft one.", "info");
				return;
			}
			if (files.length === 0) {
				ctx.ui.notify("No saved plans yet. Use /plan <topic> to draft one.", "info");
				return;
			}
			const selected = await ctx.ui.select("Plan documents", files);
			if (selected === undefined) return;
			const path = join(dir, selected);
			let lines: string[];
			try {
				lines = readFileSync(path, "utf-8").split(/\r?\n/);
			} catch (error) {
				ctx.ui.notify(`Failed to read plan: ${error instanceof Error ? error.message : String(error)}`, "error");
				return;
			}
			await ctx.ui.custom<void>(
				(_tui, theme, _kb, done) =>
					new PlanLineEditor(lines, selected, theme, {
						onClose: () => done(),
						onApply: (updated) => {
							try {
								writeFileSync(path, updated.join("\n"), "utf-8");
							} catch (error) {
								ctx.ui.notify(
									`Failed to save plan: ${error instanceof Error ? error.message : String(error)}`,
									"error",
								);
							}
						},
						onRewriteLine: (doc, lineIndex, instruction) => rewriteLine(ctx, doc, lineIndex, instruction),
						onError: (message) => ctx.ui.notify(message, "error"),
					}),
			);
		},
	});
}

const LINE_REWRITE_SYSTEM_PROMPT =
	"You rewrite a single line of a Markdown plan document. Output ONLY the replacement line as plain text: no quotes, no code fences, no explanation.";

/** Ask the model for a replacement for one line; returns undefined if it declined. */
async function rewriteLine(
	ctx: ExtensionContext,
	doc: string[],
	lineIndex: number,
	instruction: string,
): Promise<string | undefined> {
	if (!ctx.model) throw new Error("No model selected");
	const current = doc[lineIndex] ?? "";
	const prompt = [
		"Markdown plan document:",
		doc.map((line, i) => `${i + 1}. ${line}`).join("\n"),
		"",
		`Line to rewrite (line ${lineIndex + 1}): ${current}`,
		`Requested change: ${instruction}`,
		"",
		"Output only the replacement line.",
	].join("\n");
	const stream = ctx.modelRegistry.streamSimple(
		ctx.model,
		{
			systemPrompt: LINE_REWRITE_SYSTEM_PROMPT,
			messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
		},
		{ signal: ctx.signal },
	);
	const message = await stream.result();
	const text = message.content
		.filter((c) => c.type === "text")
		.map((c) => c.text)
		.join("\n")
		.trim();
	if (!text) return undefined;
	// Strip a wrapping code fence or quote pair if the model added one.
	return text
		.replace(/^```[a-z]*\n?/i, "")
		.replace(/\n?```$/i, "")
		.replace(/^["'`](.*)["'`]$/s, "$1")
		.split(/\r?\n/)[0];
}

/** Extract unchecked checklist item texts from a Markdown plan. */
function parseChecklist(markdown: string): string[] {
	return markdown
		.split(/\r?\n/)
		.map((line) => line.match(/^\s*[-*]\s*\[\s*\]\s*(.+)$/))
		.filter((match): match is RegExpMatchArray => match !== null)
		.map((match) => match[1].trim());
}
