# AGENT.md — @earendil-works/chord

全局规则见根目录 [AGENT.md](../AGENT.md) 与 [AGENTS.md](../AGENTS.md)，本文件只补充本包专属规则。

## 职责

类型化宿主运行时：热重载插件宿主（`host.ts`、`manager.ts`、`reload.ts`）、契约与 schema（`contract.ts`、`schema.ts`）、复制状态（`delta/`、`record.ts`）、JSON 链路 RPC（`link.ts`、`wire.ts`、`websocket.ts`）。

## 边界（禁止事项）

- 唯一运行时依赖是 `typebox`。禁止引入任何其他运行时依赖。
- **CLI 链路隔离**：禁止被 `coding-agent`、`agent-core`、`ai`、`tui`、`mcp`、`codemode` import（根 AGENT.md 第 1 条跨栈禁令）。本包只被 `durable`、`env` 消费。
- 与 `durable`/`env` 的职责划分：chord 只管宿主/插件/链路/复制状态，不懂"会话、任务、文档"等业务概念——业务持久化属于 durable。

## 编码规则

- wire 协议（`wire.ts`、`schema.ts`）是线上兼容面：帧结构变更必须保持前后兼容或升协议版本，并同步 conformance 测试。
- 复制状态（`delta/`）的 op 语义不得改变；新增 op 类型必须可幂等重放。
- 锁与子进程（`node.ts` 相关）改动要覆盖 macOS/Windows 的路径与信号差异（历史提交多次踩坑：`sun_path` 限制、锁 socket 路径、子进程环境变量继承）。

## 验收

- `npm run check` 全绿；本包工作区测试通过。
