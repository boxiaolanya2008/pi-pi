# AGENT.md — @earendil-works/pi-telemetry

全局规则见根目录 [AGENT.md](../AGENT.md) 与 [AGENTS.md](../AGENTS.md)，本文件只补充本包专属规则。

## 职责

厂商中立的遥测契约：类型化 schema、参考适配器（`memory.ts`、`noop.ts`）、conformance 测试（`testing/`）。

## 边界（禁止事项）

- **零运行时依赖**，这是硬边界。禁止引入任何遥测 SDK（PostHog、Sentry 等一律不进本包）——厂商对接属于消费方自己的适配器。
- 被所有其他包依赖（`pi-ai` 直接依赖本包），因此本包必须保持最小、最稳：禁止 import 仓库内其他包。
- schema 字段是线上兼容面：改名/删字段是破坏性变更，只能新增字段 + CHANGELOG 记录。

## 编码规则

- `noop.ts` 是默认实现路径：新增契约方法必须同步 noop 与 memory 参考实现及 conformance 用例，三者缺一不可。
- 事件载荷只放契约化数据，禁止塞入任意用户内容（隐私边界）。

## 验收

- `npm run check` 全绿；`check:runtime-deps` 对本包应保持零依赖。
