# AGENT.md — @earendil-works/pi-durable

全局规则见根目录 [AGENT.md](../AGENT.md) 与 [AGENTS.md](../AGENTS.md)，本文件只补充本包专属规则。

## 职责

持久化业务运行时：会话（`session/`）、任务（`tasks.ts`）、文档（`documents.ts`）、图片（`images/`）、工具搜索（`tool-search/`）、codemode 集成（`codemode/`）、多后端存储（`storage/`：memory/jsonl/sqlite，含 node 与 cloudflare 变体）、测试 harness（`harness/`）。

## 边界（禁止事项）

- 依赖只允许：`chord`、`pi-ai`、`pi-codemode`、`photon`、`diff`、`typebox`。禁止 import `coding-agent`、`agent-core`、`tui`、`mcp`、`env`。
- **CLI 链路隔离**：本包是云运行时栈，禁止被 `coding-agent`/`agent-core`/`ai`/`tui`/`mcp`/`codemode` import。
- 存储后端各自隔离：`storage/jsonl/*` 与 `storage/sqlite/*` 的 node 变体才可用 Node API，顶层与 cloudflare 变体保持环境中立。
- 会话/条目格式（`entries.ts`、`session/`）是持久化兼容面：格式变更必须提供迁移或版本标记，禁止直接改字段语义。

## 编码规则

- 新存储后端必须实现 `storage/` 既有的统一接口并配 conformance 用例（`testing/`），禁止绕过接口直接暴露驱动 API。
- `harness/` 是给消费方用的集成测试设施，改动需保证既有 harness 用户可平滑升级。
- 截断（`truncate.ts`）与搜索（`search.ts`）语义与 `pi-ai` 的消息契约保持一致，不重复实现消息类型。

## 验收

- `npm run check` 全绿；本包工作区测试通过。
