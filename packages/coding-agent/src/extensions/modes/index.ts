/**
 * Mode switching.
 *
 * Shift+Tab cycles the working mode, `/mode` lists them, and the model can set one itself with
 * `set_mode`. The active mode is stored on the session branch, so resume and branch switches restore it
 * the same way plan mode and todos already are.
 *
 * Plan is not reimplemented here. It delegates to the same controller the `plan` extension uses, so
 * `/plan`, the `plan_mode` tool, and Shift+Tab cannot end up disagreeing about write access.
 */

import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "../../core/extensions/types.ts";
import { applyMode, cycleMode, DEFAULT_MODE, getMode, MODES, type ModeId, readMode } from "../../core/modes.ts";

/** Shift+Tab arrives as CSI Z in a terminal; some send SS3 P instead. */
const SHIFT_TAB_SEQUENCES = ["\x1b[Z", "\x1bOP"];

export default function modesExtension(pi: ExtensionAPI): void {
	let active: ModeId = DEFAULT_MODE;

	/** Re-apply the mode and its status line from the branch. */
	const restore = (ctx: ExtensionContext): void => {
		active = readMode(ctx.sessionManager.getBranch());
		const definition = getMode(active);
		ctx.ui.setStatus(
			"pi-pi-mode",
			definition.prompt === "" ? undefined : ctx.ui.theme.fg("accent", definition.label),
		);
	};

	pi.on("session_start", async (_event, ctx) => {
		// Shift+Tab is handled here rather than through a keybinding: the extension API cannot register
		// one, and `onTerminalInput` is the documented hook for raw keys. Consuming the sequence is what
		// stops the editor's own Shift+Tab from firing as well.
		ctx.ui.onTerminalInput((data) => {
			if (!SHIFT_TAB_SEQUENCES.includes(data)) return undefined;
			// While the agent is streaming, leave the key to the editor rather than switching mid-turn.
			if (!ctx.isIdle()) return undefined;
			active = cycleMode(pi, ctx, readMode(ctx.sessionManager.getBranch()));
			const definition = getMode(active);
			ctx.ui.notify(`Mode: ${definition.label} - ${definition.hint}`, "info");
			return { consume: true };
		});
		restore(ctx);
	});

	pi.on("session_tree", async (_event, ctx) => {
		restore(ctx);
	});

	pi.on("before_agent_start", async (event) => {
		const definition = getMode(active);
		if (definition.prompt === "") return undefined;
		// Appended to the static prefix, so it is cached and does not invalidate the cache between turns.
		if (event.systemPrompt.includes(definition.prompt)) return undefined;
		return { systemPrompt: `${event.systemPrompt}\n\n${definition.prompt}` };
	});

	pi.registerTool({
		name: "set_mode",
		label: "Set Mode",
		description:
			"Switch the working mode when a task clearly needs a different working style. " +
			"Modes: " +
			MODES.map((mode) => `${mode.id} (${mode.label}: ${mode.hint})`).join("; "),
		// A plain string validated below: a literal union built from the table loses its literal types.
		parameters: Type.Object({ mode: Type.String({ description: "Mode id" }) }),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const target = MODES.find((mode) => mode.id === (params as { mode: string }).mode);
			if (!target) {
				return {
					content: [
						{
							type: "text",
							text: `Unknown mode "${(params as { mode: string }).mode}". Use one of: ${MODES.map((mode) => mode.id).join(", ")}.`,
						},
					],
					isError: true,
					details: {},
				};
			}
			active = target.id;
			applyMode(pi, ctx, target.id);
			return {
				content: [{ type: "text", text: `Mode set to ${target.label}: ${target.hint}` }],
				details: { mode: target.id },
			};
		},
	});

	pi.registerCommand("mode", {
		description: "Show or switch the working mode",
		handler: async (args, ctx) => {
			const requested = args.trim();
			if (requested === "") {
				const lines = MODES.map(
					(mode) => `${mode.id === active ? "*" : " "} ${mode.id} - ${mode.label}: ${mode.hint}`,
				);
				ctx.ui.notify(`Modes:\n${lines.join("\n")}`, "info");
				return;
			}
			const target = MODES.find((mode) => mode.id === requested);
			if (!target) {
				ctx.ui.notify(`Unknown mode: ${requested}. Try: ${MODES.map((mode) => mode.id).join(", ")}`, "warning");
				return;
			}
			active = target.id;
			applyMode(pi, ctx, target.id);
			ctx.ui.notify(`Mode: ${target.label} - ${target.hint}`, "info");
		},
	});
}
