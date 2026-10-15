# AGENT.md — @earendil-works/pi-tui

全局规则见根目录 [AGENT.md](../AGENT.md) 与 [AGENTS.md](../AGENTS.md)，本文件只补充本包专属规则。

## 职责

自研终端 UI 库：差分渲染管线、布局（layout/flex）、编辑器组件、常用组件（`components/`）、按键处理与 keybinding、各平台原生模块（`native-*`）。

## 边界（禁止事项）

- **纯 UI 库**：禁止 import `ai`、`agent-core`、`coding-agent`、`mcp`、`codemode`、`chord`、`durable`、`env`。不得出现任何 LLM、会话、业务概念。
- 依赖只允许：`get-east-asian-width`、`marked`。**禁止引入新 UI/渲染框架**（React、Ink 等）——渲染管线是自研差分渲染，替代方案一律拒绝。
- `native-*` 平台模块是原生构建产物对接层，禁止改动其构建假设；新增平台支持必须走 `build:native:*` 脚本链路。

## 编码规则

- 组件必须实现 `Component` 接口（`render(width): string[]` + `invalidate()`）；带缓存的渲染必须用宽度做缓存键并在 `invalidate()` 中清空。
- 文本宽度计算一律用 `utils.ts` 的 `visibleWidth`/`truncateToWidth`/`sliceByColumn`，禁止手写字符串长度逻辑（东亚宽字符会算错）。
- 按键匹配一律走 `getKeybindings()`，禁止硬编码按键序列（根 AGENTS.md：keybinding 例外走 DEFAULT_*_KEYBINDINGS）。
- 新组件放 `components/` 并从 `index.ts` 导出；光标处理用 `CURSOR_MARKER`/`renderFakeCursor` 协议，不得直接写 ANSI 光标序列。

## 验收

- `npm run check` 全绿。
- 渲染类改动要确认不破坏差分渲染（重复 render(width) 结果必须稳定、无随机内容）。
