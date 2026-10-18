/**
 * Working modes.
 *
 * A mode changes how the assistant works, not which model is behind it. The prompts below describe
 * behaviour only: none of them names or implies a particular model, because the point of a mode is the
 * working style, and claiming an identity would be untrue and a distraction.
 *
 * They are deliberately short. This text sits in the cached prompt prefix, so every word is paid for on
 * the first turn and again whenever the cache is cold; a long persona paragraph would cost more than it
 * saves.
 *
 * Plan mode lives here rather than in the plan extension because three places need it: `/plan`, the
 * `plan_mode` tool, and Shift+Tab. One controller per `pi` instance keeps them from disagreeing about
 * whether write access is available.
 */

import type { ExtensionAPI, ExtensionContext } from "./extensions/types.ts";

export type ModeId = "agent" | "plan" | "astra" | "astra-opus";

export interface ModeDefinition {
	id: ModeId;
	/** Shown in the status bar and the mode picker. */
	label: string;
	/** One-line hint. */
	hint: string;
	/** Appended to the system prompt. Empty for the default mode. */
	prompt: string;
}

/** Custom entry type used to persist the active mode on the session branch. */
export const MODE_ENTRY_TYPE = "pi-pi-mode";
/** The plan extension persists its own state under this type. */
export const PLAN_MODE_ENTRY_TYPE = "plan-mode";
/** What stays available in plan mode: read and search, plus the plan tool. */
export const PLAN_READONLY_TOOLS = ["read", "bash", "grep", "find", "ls"];

export const MODES: readonly ModeDefinition[] = [
	{
		id: "agent",
		label: "Agent",
		hint: "默认模式：直接动手完成任务",
		prompt: "",
	},
	{
		id: "plan",
		label: "Plan",
		hint: "只读设计：产出可执行方案，不改文件",
		prompt: [
			"当前为计划模式：只做调研与设计，不修改任何文件。",
			"- 先只读地理解相关代码，再输出可执行的方案：涉及哪些文件、每处怎么改、有什么风险。",
			"- 方案里不要粘贴大段完整代码，指出位置和改法即可。",
			"- 确认后再切到 Agent 模式执行。",
		].join("\n"),
	},
	{
		id: "astra",
		label: "GPT-6-Astra / Claude-Opus-5-5",
		hint: "动手操作与高难度专业任务",
		prompt: [
			"当前为 Astra 模式：偏向动手操作与高难度专业任务。",
			"- 优先直接动手完成目标，而不是只给建议；能自己验证的就自己验证再汇报。",
			"- 遇到困难任务保持推进：拆解、逐步验证、失败就换路径，不要轻易退回给用户。",
			"- 数学推导、安全分析、系统操作这类专业任务要求结论准确，不编造未验证的事实。",
			"- 涉及系统或设备操作时，先确认授权范围再执行。",
		].join("\n"),
	},
	{
		id: "astra-opus",
		label: "Astra-Opus",
		hint: "极限推理 + 长程工程 + 边界自律",
		prompt: [
			"当前为 Astra-Opus 模式：兼具极限推理的突破力与长程工程的严谨。",
			"- 动手能力：自主操作脚本、工具链与界面完成任务，并自行验证结果。",
			"- 长程耐力：面对大型代码库或跨小时任务保持专注，先建立全局理解再动手。",
			"- 严谨：涉及数字与事实的内容必须可核查，不虚构数据、引语或结论。",
			"- 边界自律：严格在用户授权范围内操作，需要额外权限时先询问。",
			"- 汇报把结论和重点放在最前面，不写冗长铺垫。",
		].join("\n"),
	},
];

export const DEFAULT_MODE: ModeId = "agent";

export function getMode(id: ModeId | undefined): ModeDefinition {
	return MODES.find((mode) => mode.id === id) ?? MODES[0]!;
}

/** The next mode in Shift+Tab order, wrapping at the end. */
export function nextMode(current: ModeId | undefined): ModeId {
	const index = MODES.findIndex((mode) => mode.id === current);
	return MODES[(index + 1 + MODES.length) % MODES.length]!.id;
}

/** Read the mode a branch was left in, so resume and branch switches restore it. */
export function readMode(entries: readonly { type?: string; customType?: string; data?: unknown }[]): ModeId {
	let mode: ModeId = DEFAULT_MODE;
	for (const entry of entries) {
		if (entry.type !== "custom" || entry.customType !== MODE_ENTRY_TYPE) continue;
		const data = entry.data as { mode?: string } | undefined;
		const found = MODES.find((candidate) => candidate.id === data?.mode);
		if (found) mode = found.id;
	}
	return mode;
}

export interface PlanModeController {
	isEnabled(): boolean;
	enter(ctx: ExtensionContext): void;
	exit(ctx: ExtensionContext): void;
	/** Re-apply from the branch, for resume and branch switches. */
	restore(ctx: ExtensionContext): void;
}

const planControllers = new WeakMap<ExtensionAPI, PlanModeController>();

/** One controller per `pi`, so every trigger sees the same state. */
export function createPlanModeController(pi: ExtensionAPI): PlanModeController {
	const existing = planControllers.get(pi);
	if (existing) return existing;

	let enabled = false;
	let toolsBefore: string[] | undefined;

	const readOnlyTools = (): string[] => {
		const active = new Set(
			(toolsBefore ?? pi.getActiveTools()).filter((name) => name !== "edit" && name !== "write"),
		);
		for (const name of PLAN_READONLY_TOOLS) active.add(name);
		active.add("save_plan");
		return [...active];
	};

	const controller: PlanModeController = {
		isEnabled: () => enabled,
		enter(ctx) {
			if (enabled) return;
			toolsBefore = pi.getActiveTools();
			pi.setActiveTools(readOnlyTools());
			enabled = true;
			pi.appendEntry(PLAN_MODE_ENTRY_TYPE, { enabled: true, toolsBeforePlanMode: toolsBefore });
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("warning", "plan"));
		},
		exit(ctx) {
			if (!enabled) return;
			pi.setActiveTools(toolsBefore ?? pi.getActiveTools());
			toolsBefore = undefined;
			enabled = false;
			pi.appendEntry(PLAN_MODE_ENTRY_TYPE, { enabled: false });
			ctx.ui.setStatus("plan-mode", undefined);
		},
		restore(ctx) {
			let storedEnabled = false;
			let storedTools: string[] | undefined;
			for (const entry of ctx.sessionManager.getBranch()) {
				if (entry.type !== "custom") continue;
				const custom = entry as {
					customType?: string;
					data?: { enabled?: boolean; toolsBeforePlanMode?: string[] };
				};
				if (custom.customType !== PLAN_MODE_ENTRY_TYPE) continue;
				storedEnabled = custom.data?.enabled ?? false;
				storedTools = custom.data?.toolsBeforePlanMode;
			}
			if (storedEnabled && !enabled) {
				toolsBefore = storedTools;
				pi.setActiveTools(readOnlyTools());
				enabled = true;
				ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("warning", "plan"));
			} else if (!storedEnabled && enabled) {
				controller.exit(ctx);
			}
		},
	};

	planControllers.set(pi, controller);
	return controller;
}

/**
 * Switch to a mode.
 *
 * Plan is the only mode that changes permissions; the rest are prompt only. The entry is appended before
 * applying so the branch stays consistent even if something below throws.
 */
export function applyMode(pi: ExtensionAPI, ctx: ExtensionContext, mode: ModeId): void {
	const planMode = createPlanModeController(pi);
	if (mode === "plan") {
		planMode.enter(ctx);
	} else if (planMode.isEnabled()) {
		planMode.exit(ctx);
	}

	pi.appendEntry(MODE_ENTRY_TYPE, { mode });
	const definition = getMode(mode);
	ctx.ui.setStatus("pi-pi-mode", definition.prompt === "" ? undefined : ctx.ui.theme.fg("accent", definition.label));
}

/** Cycle to the next mode, which is what Shift+Tab does. */
export function cycleMode(pi: ExtensionAPI, ctx: ExtensionContext, current: ModeId | undefined): ModeId {
	const target = nextMode(current);
	applyMode(pi, ctx, target);
	return target;
}
