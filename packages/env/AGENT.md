# AGENT.md — @earendil-works/pi-env

全局规则见根目录 [AGENT.md](../AGENT.md) 与 [AGENTS.md](../AGENTS.md)，本文件只补充本包专属规则。

## 职责

chord+durable 之上的环境层：把宿主、会话与文档运行时组装成可部署环境。

## 边界（禁止事项）

- 依赖只允许：`chord`、`pi-durable`。禁止 import 其他任何包，禁止新增运行时依赖。
- **CLI 链路隔离**：禁止被 `coding-agent`、`agent-core`、`ai`、`tui`、`mcp`、`codemode` import。
- 本包是组装层：缺能力时优先下沉到 `chord`（宿主/链路）或 `durable`（业务），禁止在 env 里堆业务逻辑。

## 编码规则

- 导出面保持最小（`src/index.ts` 单一入口）；新增导出必须有既有消费方。
- 组装逻辑不得复制 chord/durable 的内部实现细节（绕过其公共 API 直接摸内部状态属于越界）。

## 验收

- `npm run check` 全绿。
