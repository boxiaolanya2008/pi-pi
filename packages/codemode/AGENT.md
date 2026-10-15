# AGENT.md — @earendil-works/pi-codemode

全局规则见根目录 [AGENT.md](../AGENT.md) 与 [AGENTS.md](../AGENTS.md)，本文件只补充本包专属规则。

## 职责

基于 QuickJS（WASM）的脚本沙箱运行时：脚本编译与执行（`runtime/`）、声明生成（`declarations.ts`）、宿主可移植层（`portable.ts`）、Cloudflare 适配（`cloudflare.ts`）。

## 边界（禁止事项）

- 唯一运行时依赖是 `quickjs-wasi`。**禁止引入 Node `vm`、`Function` 构造器等替代沙箱**，也禁止新增脚本转译器依赖。
- 沙箱边界不得松动：宿主能力只能通过 `runtime/protocol.ts` 定义的桥接协议进入 guest 环境，禁止把 `node:fs`、`node:child_process` 等能力直接暴露给脚本。
- 禁止 import `ai`、`agent-core`、`coding-agent`、`tui`、`mcp`、`chord`、`durable`、`env`。
- `cloudflare.ts` 与 `cloudflare-modules.d.ts` 面向 Workers 环境，改动不得引入 Node 专属 API。

## 编码规则

- 桥接协议（`runtime/protocol.ts`）是宿主与 guest 的唯一通道：消息类型变更视为破坏性变更，记录 CHANGELOG 并同步 `declarations.ts`。
- `declarations.ts` 是给脚本看的类型声明面，必须与实际桥接能力严格一致——声明了但桥接不存在（或反之）都属于 bug。
- 脚本执行超时与中断语义不得改变；新错误类别要在协议中显式建模，禁止用字符串拼接表达结构化错误。

## 验收

- `npm run check` 全绿。
