# AGENT.md — @earendil-works/pi-ai

全局规则见根目录 [AGENT.md](../AGENT.md) 与 [AGENTS.md](../AGENTS.md)，本文件只补充本包专属规则。

## 职责

统一多 provider LLM API：消息类型与流式事件协议、各 provider 适配器（`api/`）、provider 注册与模型目录（`providers/`）、OAuth、兼容层（`compat/`）。

## 边界（禁止事项）

- 依赖只允许：`@earendil-works/pi-telemetry`、typebox、partial-json 及 provider 运行所需的最小集合。**禁止 import `agent-core`、`coding-agent`、`tui`、`mcp`、`codemode`、`chord`、`durable`、`env`**。
- **禁止新增 provider SDK 依赖**（openai/anthropic/google SDK 已存在，仅为它们服务，不得为新 provider 引入新 SDK）。新 provider 一律手写 HTTP/流式对接，放在 `api/` 下新建适配器。
- `models.generated.ts` 与 `src/providers/data/` 是生成物：**禁止手改**。新增/修改模型数据必须改 `scripts/generate-models.ts` 后运行 `npm run generate:models` 再生成。
- `src/providers/*.models.ts` 同为生成物，同上。

## 编码规则

- 公共 API 由 `src/index.ts` 收口；`providers/*`、`api/*`、`utils/*` 的子路径导出已在 package.json `exports` 声明，新增子路径导出需同步更新 `exports` 与 `check:entry-graphs` 预算。
- 消息/事件类型是跨包契约：修改 `types.ts` 中的类型等于破坏性变更，必须记录到本包 CHANGELOG 的 Breaking Changes，并评估 agent/coding-agent 两侧的适配。
- 新适配器必须实现 `stream` 与 `streamSimple` 两个 StreamFunction，错误终止必须产生 `stopReason: "error"|"aborted"` 的 AssistantMessage（见 `types.ts` 的 StreamFunction 契约注释）。
- 兼容开关（`compat`）只描述"已验证的上游行为差异"，禁止凭推测开启。
- 思考等级映射：`thinkingLevelMap` 只描述模型真实支持的档位，禁止为了让某档出现而虚标。

## 验收

- `npm run check` 全绿（含 `check:model-data`）。
- 模型数据有增删时，同步更新受影响的确切清单测试（如 `test/anthropic-adaptive-thinking-models.test.ts`）。
