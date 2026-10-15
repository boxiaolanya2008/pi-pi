# AGENT.md — @earendil-works/pi-agent-core

全局规则见根目录 [AGENT.md](../AGENT.md) 与 [AGENTS.md](../AGENTS.md)，本文件只补充本包专属规则。

## 职责

Agent 运行时内核：`agentLoop` 循环、工具调用编排（并行/串行）、steering/follow-up 消息、事件流（EventStream）。本包是整个产品的"心脏"，体积必须保持最小。

## 边界（禁止事项）

- 禁止 import `coding-agent`、`tui`、`mcp`、`codemode`、`chord`、`durable`、`env`——只允许依赖 `@earendil-works/pi-ai` 与 `typebox`。
- **零 node 内置模块**（`node:fs`、`node:child_process` 等一律禁止）。本包必须保持环境中立（Node/Bun/边缘运行时皆可用），任何平台相关逻辑都放不进来。
- 禁止引入 UI、文件系统、网络请求、持久化等能力——那些属于上层。
- 不为"将来的功能"预留钩子、配置项、抽象层。

## 编码规则

- 新增事件类型必须同时更新 `types.ts` 的联合类型，且事件名与既有命名风格一致（`agent_start`、`turn_end`、`tool_execution_*`）。
- 工具调用生命周期钩子（`beforeToolCall`/`afterToolCall`）语义不得改变：校验只发生在 `prepareToolCall` 一层。
- `agent-loop.ts` 的主循环结构（外层 follow-up / 内层 steering）不要重构；改动必须保证 `agentLoopContinue` 的前置校验语义不变。
- 导出面由 `index.ts` 收口，新增导出必须有既有消费方。

## 验收

- `npm run check` 全绿。
- 净增行数超过 300 行的提交必须附"为什么不能用更少代码实现"的说明（根 AGENT.md 第 5 条）。
