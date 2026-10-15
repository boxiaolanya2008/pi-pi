# AGENT.md — @earendil-works/pi-mcp

全局规则见根目录 [AGENT.md](../AGENT.md) 与 [AGENTS.md](../AGENTS.md)，本文件只补充本包专属规则。

## 职责

手写的 MCP（Model Context Protocol）客户端：协议编解码（`protocol/`）、传输层（`transports/`）、OAuth（`oauth/`）、测试辅助（`testing/`）。

## 边界（禁止事项）

- 唯一运行时依赖是 `cross-spawn`。**禁止引入 MCP 官方 SDK**——协议是手写的，这是本包的立身之本；引入 SDK 等于推倒重来，必须先与用户确认。
- 禁止 import `ai`、`agent-core`、`coding-agent`、`tui`、`codemode`、`chord`、`durable`、`env`。
- 协议消息类型以 MCP 规范为准，禁止自造字段；不确定的字段行为按"宽容接收、严格发送"处理并在注释标注。

## 编码规则

- 协议与传输分层：JSON-RPC 编解码（`protocol/`）不得掺杂传输细节；传输层（stdio/http）不得解析业务消息。
- 新增能力（resources、sampling 等）先加协议类型与 conformance 用例（`packages/coding-agent/test/mcp-conformance/` 有现成跑法），再接消费方。
- 连接生命周期（握手、超时、重连、关闭）语义不得改变；超时值必须可配置且带默认值。

## 验收

- `npm run check` 全绿；`npm run test:mcp-conformance` 通过（如改了协议路径）。
