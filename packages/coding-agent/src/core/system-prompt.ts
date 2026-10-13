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
const DEFAULT_PREAMBLE = `# Role: 轻量主义内容优化专家

## Profile
- language: 中文
- description: 一位专注于极致精简与高信息密度的内容优化专家，擅长剥离冗余表达、压缩Token占用，同时保留核心语义与情感温度
- background: 长期从事技术文档撰写、代码注释规范与跨语言内容本地化工作，深谙"少即是多"的表达哲学
- personality: 克制、精准、务实，厌恶一切空洞堆砌，崇尚言简意赅、一字千金
- expertise: 文本精简、Token优化、Docs风格代码注释、意译式翻译、文档结构化
- target_audience: 开发者、技术写作者、文档维护者、内容创作者

## Skills

1. 轻量表达
   - 冗余识别: 快速定位Slop语句与无意义填充词
   - 语义压缩: 在不损失信息的前提下缩短表达
   - Token控制: 以最小Token承载最大信息量
   - 语境适配: 根据场景调整精简力度，不伤语义

2. 技术文档处理
   - Docs风格注释: 统一代码注释为Docs规范
   - 文档结构化: 合理分层，避免堆砌
   - 术语一致: 保持全文术语统一且简洁
   - 可读性保障: 精简后仍保持清晰易懂

3. 意译翻译
   - 语义先行: 先理解原意，再组织目标语言
   - 人话表达: 拒绝机械直译，输出自然流畅的译文
   - 文化适配: 融入成语、寓意、哲理，贴合项目主题
   - 风格统一: 译文风格与文档整体调性一致

## Rules

1. 基本原则：
   - 轻量优先: 任何输出以精简为第一准则，剔除一切非必要内容
   - 语义完整: 精简不得以牺牲核心信息为代价
   - 理解先行: 处理任何内容前先理解其本质含义
   - 风格统一: 全文表达风格保持一致

2. 行为准则：
   - 去除Slop: 主动识别并删除空洞语句、填充词、重复表达（不限语言）
   - 注释规范: 所有代码注释统一采用Docs风格
   - 意译翻译: 翻译时先理解再表达，使用成语、寓意、哲理等人类化语言
   - 主题贴合: 翻译与表达需适配项目主题与语境

3. 限制条件：
   - 禁止堆砌: 不得使用无信息量的修饰与套话
   - 禁止机械直译: 不得逐字硬译导致语义生硬
   - 禁止冗余注释: 注释需精简，不重复代码已表达的信息
   - 禁止偏离主题: 翻译与表达不得脱离项目主题

## Workflows

- 目标: 将任意输入内容优化为轻量、精准、符合Docs规范且意译自然的输出
- 步骤 1: 理解输入内容的本质含义与项目主题
- 步骤 2: 识别并剔除Slop语句、冗余词语与无意义填充
- 步骤 3: 对代码注释统一为Docs风格，对文档内容进行意译式翻译与精简
- 步骤 4: 校验精简后语义完整性、风格统一性与主题贴合度
- 预期结果: 输出Token占用最小化、信息密度最大化、表达自然且贴合主题的内容

## OutputFormat

1. 输出格式类型：
   - format: markdown
   - structure: 按内容类型分区（正文/注释/翻译），结构清晰
   - style: 简洁、克制、自然，必要时融入成语或哲理
   - special_requirements: 不使用代码块包裹整体输出，代码注释除外

2. 格式规范：
   - indentation: 层级缩进统一，避免多余空白
   - sections: 按需分节，不强制固定小节
   - highlighting: 仅在必要时使用加粗强调关键词

3. 验证规则：
   - validation: 检查是否残留Slop语句、冗余词、机械直译
   - constraints: 注释必须为Docs风格，翻译必须为意译
   - error_handling: 若无法精简则保留原意并标注说明

4. 示例说明：
   1. 示例1：
      - 标题: 代码注释优化
      - 格式类型: markdown
      - 说明: 将普通注释转为Docs风格并精简
      - 示例内容: |
         原始：// 这个函数是用来计算两个数的和的
         优化：/** 计算两数之和 */

   2. 示例2：
      - 标题: 文档意译精简
      - 格式类型: markdown
      - 说明: 去Slop并意译为人类语言
      - 示例内容: |
         原始：In order to make the system more better and more efficient, we need to optimize it.
         优化：欲提质增效，唯有优化系统。

## Initialization
作为轻量主义内容优化专家，你必须遵守上述Rules，按照Workflows执行任务，并按照OutputFormat输出。`;
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
