/**
 * System prompt construction and project context loading
 */

import { getSystemMessageText } from "@earendil-works/pi-ai";
import { getDocsPath, getExamplesPath, getReadmePath } from "../config.ts";
import { formatSkillsForPrompt, type Skill } from "./skills.ts";

export interface BuildSystemPromptOptions {
	/** Custom system prompt (replaces the default prefix). */
	customPrompt?: string;
	/** Exact full prompt replacement set by a before_agent_start handler. */
	forceSystemPrompt?: string;
	/** Tools to include in prompt. Default: [read, bash, edit, write]. */
	selectedTools?: string[];
	/**
	 * Selected tools whose declarations requests leave out (`prepareLoadout` hidden declarations).
	 * They are reachable only through another tool, so the tool list and rules leave them out too.
	 */
	hiddenTools?: string[];
	/** Optional one-line tool snippets keyed by tool name. */
	toolSnippets?: Record<string, string>;
	/** Guideline bullets contributed by each tool, keyed by tool name. */
	toolGuidelines?: Record<string, string[]>;
	/** Additional guideline bullets appended to the default system prompt rules. */
	promptGuidelines?: string[];
	/** Text appended from user configuration before project context, skills, and cwd. */
	appendSystemPrompt?: string;
	/** Additional XML-wrapped prompt sections keyed by tag name. */
	sections?: Record<string, string>;
	/** Working directory. */
	cwd: string;
	/** Pre-loaded context files. */
	contextFiles?: Array<{ path: string; content: string }>;
	/** Pre-loaded skills. */
	skills?: Skill[];
}

export type NormalizedBuildSystemPromptOptions = BuildSystemPromptOptions & {
	selectedTools: string[];
	hiddenTools: string[];
	toolSnippets: Record<string, string>;
	toolGuidelines: Record<string, string[]>;
	promptGuidelines: string[];
	appendSystemPrompt: string;
	sections: Record<string, string>;
	contextFiles: Array<{ path: string; content: string }>;
	skills: Skill[];
};

/**
 * Ordered system prompt sections, keyed by name. `preamble` is untagged text; every other
 * section is wrapped in a tag of the same name so the model can match later updates to it.
 * These become `SystemMessage.sections` in the transcript.
 */
export type SystemPromptSections = Record<string, string>;

const SYSTEM_PROMPT_SECTION_NAME = /^[a-z][a-z0-9_-]*$/;

/** Default preamble, verbatim from product spec. */
const DEFAULT_PREAMBLE = `# Role: 极简主义多模块项目架构师

## Profile
- language: 中文
- description: 一位专注于极简主义哲学与2026年前沿设计风格的项目架构师，擅长以 docs 格式注释代码、以 rts 文件格式组织项目、以多模块架构搭建可维护系统，并确保每个模块配备专属 AGENT.md 与 docs 编码规则文档。回复风格带有 Claude 式的人情味，拒绝机器化表达。
- background: 深耕软件架构与开发规范领域，经历过从单体到微服务再到模块化智能体的演进，对设计趋势的时效性极为敏感，明确以 2026 年 1 月为设计风格分水岭，主动摒弃此前所有过时范式。
- personality: 极简、克制、温暖、直率；思考极简、表达极简，但在专业判断上绝不妥协；拒绝冗余寒暄，但在关键处保留人情味。
- expertise: 代码注释规范（docs 格式）、rts 文件格式、2026 年设计风格、多模块架构设计、AGENT.md 编写、docs 编码规则管理、文档同步机制、幻觉抑制。
- target_audience: 需要搭建可维护、文档完备、设计前沿的项目开发者与团队。

## Skills

1. 核心架构技能
   - 多模块架构设计: 默认将所有项目拆分为高内聚低耦合的模块，每个模块职责单一。
   - AGENT.md 编写: 为每个模块生成对应的 AGENT.md，明确该模块的职责、边界与协作方式。
   - docs 编码规则管理: 在每个模块的 docs 文件夹中放置该模块专属编码规则，且规则不得侵入或影响模块本身逻辑。
   - rts 文件格式应用: 项目文件统一使用 rts 格式组织与输出。

2. 辅助规范技能
   - docs 格式注释: 所有代码注释严格采用 docs 格式，保持极简。
   - 2026 设计风格落地: 优先采用 2026 年设计风格，主动摒弃 2026 年 1 月之前的过时风格。
   - 文档同步机制: 每次修改文件后，同步更新项目中所有相关文档，杜绝一次性更新。
   - 幻觉抑制: 严格区分已知与未知，绝不将不存在的事物描述为存在。

## Rules

1. 基本原则：
   - 极简优先: 极简模式、极简思考、极简回答，删减一切非必要内容。
   - 时效设计: 设计风格必须以 2026 年为基准，优先 2026 年风格，抛弃 2026 年 1 月之前的一切设计风格。
   - 模块自治: 默认多模块架构，每个模块必须有对应的 AGENT.md。
   - 文档伴随: 每个模块支持建立 docs 文件夹，存放该模块的编码规则。

2. 行为准则：
   - 文档隔离: docs 文件夹内的编码规则不得影响模块本身的功能与结构。
   - 持续同步: 每次修改文件后，必须检查并更新项目中的所有相关文档，而非仅更新一次。
   - 风格一致: 回复风格参考 Claude，带有人的温度与判断，避免机械化模板腔。
   - 注释规范: 所有代码注释统一使用 docs 格式，且保持极简。

3. 限制条件：
   - 禁止幻觉: 不得将不存在的东西想象成存在，不确定的信息必须明确标注或询问。
   - 禁止过时设计: 不得引入 2026 年 1 月之前的任何设计风格。
   - 禁止冗余: 不得输出无必要的解释、铺垫或客套。
   - 禁止文档滞后: 不得在修改文件后遗漏任何相关文档的更新。

## Workflows

- 目标: 以极简方式交付符合 2026 设计风格的多模块项目，并保证文档与代码始终同步。
- 步骤 1: 分析需求，将项目拆分为多个职责单一的模块。
- 步骤 2: 为每个模块生成对应的 AGENT.md，并建立 docs 文件夹写入该模块编码规则（确保规则不侵入模块）。
- 步骤 3: 使用 rts 文件格式输出项目，所有代码注释采用 docs 格式，设计风格落地 2026 年标准。
- 步骤 4: 每次修改文件后，遍历并同步更新项目中所有相关文档。
- 预期结果: 项目结构清晰、风格前沿、文档完备且实时同步，无幻觉内容，回复自然有人情味。

## OutputFormat

1. 输出格式类型：
   - format: text
   - structure: 极简分段，按模块与文档需求组织
   - style: 极简、直接、带 Claude 式人情味
   - special_requirements: 不使用代码块包围整体回复；按需展示 rts 文件内容与 docs 注释

2. 格式规范：
   - indentation: 极简缩进，层级不超过必要深度
   - sections: 按模块 / 文档 / 注释分节，节内不冗余
   - highlighting: 仅对关键约束与模块名做必要强调

3. 验证规则：
   - validation: 检查是否包含 AGENT.md、docs 文件夹、rts 格式、docs 注释、2026 风格
   - constraints: 不得出现 2026 年 1 月之前的设计风格；不得遗漏文档同步
   - error_handling: 若信息不足或存在不确定，直接说明并询问，不编造

4. 示例说明：
   1. 示例1：
      - 标题: 单模块 AGENT.md 示例
      - 格式类型: text
      - 说明: 展示模块与其 AGENT.md 的对应关系
      - 示例内容: |
         模块：auth
         AGENT.md：负责鉴权逻辑，边界为 token 校验与刷新，不处理用户资料。
         docs/：auth 模块编码规则，仅约束命名与注释，不改动鉴权逻辑。

   2. 示例2：
      - 标题: docs 格式注释示例
      - 格式类型: text
      - 说明: 极简 docs 注释
      - 示例内容: |
         docs:
         校验 token 有效性
         返回布尔值

## Initialization
作为极简主义多模块项目架构师，你必须遵守上述 Rules，按照 Workflows 执行任务，并按照 OutputFormat 输出。`;
/** Normalize prompt input into the mutable, collection-complete shape exposed to extensions. */
export function normalizeBuildSystemPromptOptions(input: BuildSystemPromptOptions): NormalizedBuildSystemPromptOptions {
	return {
		customPrompt: input.customPrompt,
		forceSystemPrompt: input.forceSystemPrompt,
		selectedTools: [...(input.selectedTools ?? ["read", "bash", "edit", "write"])],
		hiddenTools: [...(input.hiddenTools ?? [])],
		toolSnippets: { ...(input.toolSnippets ?? {}) },
		toolGuidelines: Object.fromEntries(
			Object.entries(input.toolGuidelines ?? {}).map(([name, guidelines]) => [name, [...guidelines]]),
		),
		promptGuidelines: [...(input.promptGuidelines ?? [])],
		appendSystemPrompt: input.appendSystemPrompt ?? "",
		sections: { ...(input.sections ?? {}) },
		cwd: input.cwd,
		contextFiles: (input.contextFiles ?? []).map((file) => ({ ...file })),
		skills: (input.skills ?? []).map((skill) => ({ ...skill })),
	};
}

function renderProjectContext(contextFiles: Array<{ path: string; content: string }>): string {
	return [
		"项目专属说明与准则：",
		...contextFiles.map(
			({ path, content }) => `<project_instructions path="${path}">\n${content}\n</project_instructions>`,
		),
	].join("\n\n");
}

function buildRules(
	selectedTools: string[],
	toolGuidelines: Record<string, string[]>,
	promptGuidelines: string[],
): string {
	const rules: string[] = [];
	const seen = new Set<string>();
	const addRule = (rule: string): void => {
		const normalized = rule.trim();
		if (!normalized || seen.has(normalized)) return;
		seen.add(normalized);
		rules.push(normalized);
	};

	const hasBash = selectedTools.includes("bash");
	const hasPowerShell = selectedTools.includes("powershell");
	const hasGrep = selectedTools.includes("grep");
	const hasFind = selectedTools.includes("find");
	const hasLs = selectedTools.includes("ls");

	if ((hasBash || hasPowerShell) && !hasGrep && !hasFind && !hasLs) {
		if (hasBash && hasPowerShell) {
			addRule("列举、搜索、查找文件一律用 bash 或 PowerShell");
		} else if (hasPowerShell) {
			addRule("列举、搜索、查找文件一律用 PowerShell");
		} else {
			addRule("列举、搜索、查找文件一律用 bash（ls、rg、find）");
		}
	}

	for (const name of selectedTools) {
		for (const rule of toolGuidelines[name] ?? []) addRule(rule);
	}
	for (const rule of promptGuidelines) addRule(rule);
	addRule("回答务必简练，不写废话");
	addRule("涉及文件时，路径须清晰可查");
	return rules.map((rule) => `- ${rule}`).join("\n");
}

/** Build the ordered, independently replaceable sections of the structured system prompt. */
export function buildSystemPromptSections(input: BuildSystemPromptOptions): SystemPromptSections {
	const options = normalizeBuildSystemPromptOptions(input);
	const {
		customPrompt,
		selectedTools,
		hiddenTools,
		toolSnippets,
		toolGuidelines,
		promptGuidelines,
		appendSystemPrompt,
		sections: customSections,
		cwd,
		contextFiles,
		skills,
	} = options;

	for (const name of Object.keys(customSections)) {
		if (!SYSTEM_PROMPT_SECTION_NAME.test(name) || name === "preamble") {
			throw new Error(`Invalid system prompt section name: ${name}`);
		}
	}

	const declaredTools = selectedTools.filter((name) => !hiddenTools.includes(name));
	const promptSections: Record<string, string> = {};
	if (customPrompt) {
		promptSections.preamble = customPrompt;
	} else {
		promptSections.preamble = DEFAULT_PREAMBLE;
		const visibleTools = declaredTools.filter((name) => !!toolSnippets[name]);
		const tools =
			visibleTools.length > 0 ? visibleTools.map((name) => `- ${name}: ${toolSnippets[name]}`).join("\n") : "(none)";
		promptSections.tools = `${tools}\n\n除上述工具外，视项目配置而定，你还可能用到其他自定义工具。`;
		promptSections.rules = buildRules(declaredTools, toolGuidelines, promptGuidelines);
		promptSections.docs = `Pi 文档（仅在用户询问 pi 本身、其 SDK、扩展、主题、技能或 TUI 时阅读）：
- 主文档：${getReadmePath()}
- 其余文档：${getDocsPath()}
- 示例：${getExamplesPath()}（扩展、自定义工具、SDK）
- 阅读 pi 文档或示例时，docs/... 从"其余文档"解析，examples/... 从"示例"解析，不要当作当前工作目录下的路径
- 被问及以下主题时按括号内路径查阅：扩展（docs/extensions.md, examples/extensions/）、主题（docs/themes.md）、技能（docs/skills.md）、提示词模板（docs/prompt-templates.md）、TUI 组件（docs/tui.md）、键位（docs/keybindings.md）、SDK 集成（docs/sdk.md）、自定义 provider（docs/custom-provider.md）、添加模型（docs/models.md）、pi 包（docs/packages.md）、环境变量（docs/environment-variables.md）、MCP 服务器（docs/mcp.md）、codemode 脚本与分类/图像等非对话模型（docs/codemode.md）
- 处理 pi 相关任务时，先读文档与示例，实现前顺着 .md 交叉引用追完
- 读 pi 的 .md 文件务必读全，并跟进相关文档链接（如 TUI API 细节见 tui.md）`;
	}

	if (appendSystemPrompt) promptSections.addendum = appendSystemPrompt;
	if (contextFiles.length > 0) promptSections.project_context = renderProjectContext(contextFiles);
	// A hidden reader is still reachable through another tool, so skills stay but the hint names no tool.
	const readers = ["read", "bash"] as const;
	const skillFileReadTool =
		readers.find((tool) => declaredTools.includes(tool)) ??
		(readers.some((tool) => selectedTools.includes(tool)) ? "indirect" : undefined);
	if (skillFileReadTool && skills.length > 0) {
		const skillsPrompt = formatSkillsForPrompt(skills, skillFileReadTool).trim();
		if (skillsPrompt) promptSections.skills = skillsPrompt;
	}
	promptSections.cwd = cwd.replace(/\\/g, "/");
	for (const [name, content] of Object.entries(customSections)) {
		if (content) promptSections[name] = content;
	}

	const sections: SystemPromptSections = { preamble: promptSections.preamble };
	for (const [name, content] of Object.entries(promptSections)) {
		if (name !== "preamble") sections[name] = `<${name}>\n${content}\n</${name}>`;
	}
	return sections;
}

/**
 * The complete prompt state for `input`. A forced prompt is opaque and lives in `content`
 * with no sections; otherwise `content` is empty and the structured sections carry the prompt.
 */
export function buildSystemPromptState(input: BuildSystemPromptOptions): {
	content: string;
	sections?: SystemPromptSections;
} {
	if (input.forceSystemPrompt !== undefined) return { content: input.forceSystemPrompt };
	return { content: "", sections: buildSystemPromptSections(input) };
}

/** Build the system prompt text, rendered exactly as the transcript's system message replays it. */
export function buildSystemPrompt(input: BuildSystemPromptOptions): string {
	return getSystemMessageText({ role: "system", ...buildSystemPromptState(input), timestamp: 0 });
}

/**
 * Diff the sections the model currently has (replayed from the transcript, so never null)
 * against the desired ones. Returns a `SystemMessage.sections` patch, or undefined when
 * nothing changed.
 */
export function diffSystemPromptSections(
	previous: Record<string, string | null>,
	current: SystemPromptSections,
): Record<string, string | null> | undefined {
	const patch: Record<string, string | null> = {};
	for (const [name, text] of Object.entries(current)) {
		if (previous[name] !== text) patch[name] = text;
	}
	for (const name of Object.keys(previous)) {
		if (current[name] === undefined) patch[name] = null;
	}
	return Object.keys(patch).length > 0 ? patch : undefined;
}
