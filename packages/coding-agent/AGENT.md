# AGENT.md — @earendil-works/pi-coding-agent

全局规则见根目录 [AGENT.md](../AGENT.md) 与 [AGENTS.md](../AGENTS.md)，本文件只补充本包专属规则。本包是 CLI 主体，也是改动最频繁的包。

## 职责

编程 Agent CLI：会话管理（`core/session-manager.ts`、`core/agent-session.ts`）、内置工具（`core/tools/`）、扩展机制（`core/extensions/`）、配置体系（settings/models.json/auth）、四种运行模式（`modes/`：interactive/print/json/rpc）、内置扩展（`extensions/`）、SDK（`core/sdk.ts`）。

## 边界（禁止事项）

- 依赖只允许既定的五个内部包（`pi-agent-core`、`pi-ai`、`pi-codemode`、`pi-mcp`、`pi-tui`）与 package.json 已声明的外部依赖。**禁止 import `chord`、`durable`、`env`**（根 AGENT.md 跨栈禁令）。
- **新功能优先走扩展机制**（根 AGENT.md 第 2 条）：注册工具/命令/事件/UI 的能力放 `src/extensions/<name>/` 并在 `extensions/index.ts` 注册；只有扩展 API 表达不了才允许动 `core/`。
- 生成物与 vendored 资产禁手改：`install-lock/`（跑生成脚本）、`docs/images/` 下的图片资产、`core/export-html/vendor/`。
- `core/agent-session.ts`（4400+ 行）与 `modes/interactive/interactive-mode.ts`（7000+ 行）是高危文件：只做增量修改，**禁止结构性重构**；新增逻辑放新文件。

## 编码规则

- 新内置扩展必须遵守扩展三件套约定：状态持久化用 `pi.appendEntry`（自定义条目，分支回溯正确），UI 用 `ctx.ui.custom/select/setWidget`，模式相关 UI 必须 `ctx.mode === "tui"` 门控。
- 会话树/条目格式是持久化兼容面：`session-manager.ts` 的 entry 结构变更必须兼容旧 JSONL（新增字段可，改语义禁止）。
- 工具（`core/tools/`）统一通过 `index.ts` 的注册表暴露；新工具必须有 schema 校验、truncate 策略与 renderCall/renderResult。
- 系统提示词：默认人设是 `core/system-prompt.ts` 的 `DEFAULT_PREAMBLE`（产品指定文案，改动需用户确认）；静态段的中文化文案同属产品决策。
- 终端渲染只用 `pi-tui` 组件与 theme token（`modes/interactive/theme/`），禁止裸写 ANSI（OSC133 分区标记与光标协议除外）。

## 验收

- `npm run check` 全绿；改动测试跑对应 vitest 文件。
- 新功能涉及用户可见行为时同步 `docs/` 与 CHANGELOG。
