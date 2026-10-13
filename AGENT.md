# AGENT.md — 轻量优先编码规则

本文件约束在本仓库中新增或修改代码时的行为，核心原则是**轻量优先**：能用现有机制解决的不新增机制，能复用的不重写，能不引入的依赖不引入。

[AGENTS.md](AGENTS.md) 的既有规则（代码质量、命令、依赖安全、Git、测试）继续全部生效，本文件只做补充，冲突时以本文件为准。

## 1. 项目分层与依赖方向

当前分层（箭头表示允许的 import 方向）：

```
coding-agent → agent-core → ai → telemetry
     ├→ tui
     ├→ mcp
     └→ codemode
chord → durable → env（独立云运行时栈，CLI 不依赖）
```

规则：

- **禁止反向依赖**：`agent-core`、`ai`、`tui`、`mcp`、`codemode` 禁止 import `coding-agent`；`ai` 禁止 import `agent-core`。
- **禁止跨栈依赖**：CLI 链路上的包（coding-agent/agent/ai/tui/mcp/codemode）禁止 import `@earendil-works/chord`、`pi-durable`、`pi-env`。
- 新代码放入它所属的最小包；只被 coding-agent 用到的逻辑不得下沉到 agent-core 或 ai。

## 2. 新增/修改功能前的强制评估

任何新功能先按以下顺序选择实现位置，只有前一种不可行才考虑下一种：

1. **扩展机制**（`packages/coding-agent/src/core/extensions/`）：注册工具、命令、事件处理器、渲染器的功能一律走扩展 API，不改核心。
2. **现有工具/模块内扩展**：在既有文件上加函数或分支，前提是该文件不超过本文件第 5 条的行数上限。
3. **新模块文件**：仅在职责与现有文件不同时新建，并在 CHANGELOG 记录。
4. **新包**：默认禁止。确需新建 `packages/*` 必须先说明：为什么现有 11 个包都放不下、依赖方向如何、由谁消费。未经用户确认不建包。

评估时必须回答两个问题并写进方案：**删掉这个功能会失去什么？不新增任何文件能否实现？**

## 3. 依赖控制

- **优先级**：Node 内置模块（`node:fs`、`node:child_process` 等）> 仓库内已有依赖 > 已有依赖的既有能力 > 新第三方依赖。新第三方依赖是最后手段。
- 新增直接依赖必须同时满足，缺一不可：
  1. 无内置模块或仓库内已有依赖可替代（替代方案在提交说明中写明并解释为何不用）；
  2. 引入的是单一明确能力，不带入传递性重依赖（例如：需要 YAML 解析时禁止引入会拖入 CLI 框架的包）；
  3. 精确 pin 版本（`save-exact=true` 已保证），不使用 `^`/`~`；
  4. 通过 `npm run check`（含 `check:pinned-deps`、`check:runtime-deps`、install-lock 校验）；
  5. 有生命周期脚本的依赖必须先加入 `scripts/generate-coding-agent-install-lock.mjs` 的显式 allowlist 并经用户确认。
- **禁止**为调用一次的简单逻辑引入依赖（如：仅为解析一个简单格式引入大库，手写解析 ≤30 行即可时手写）。
- 修改 `packages/ai` 的 provider 时不得新增 provider SDK 依赖：provider 对接直接用 `ai` 包既有的 HTTP/流式基础设施（参考 `packages/ai/src/providers/` 现有手写实现）。
- `undici` 升级按 AGENTS.md 规则先读 changelog；任何依赖升级需说明对产物体积/启动时间的影响。

## 4. 模块拆分与复用要求

- **复用优先清单**（写代码前先 grep 确认是否已存在）：
  - 错误工具结果构造 → agent-core 的 `createErrorToolResult` 模式（`packages/agent/src/agent-loop.ts:912`）
  - 流式事件处理 → `agentLoop` 的 EventStream（`packages/agent/src/agent-loop.ts:38`）
  - 工具参数校验 → `validateToolArguments`（pi-ai）
  - 截断/输出控制 → `packages/coding-agent/src/core/tools/truncate.ts`、`output-accumulator.ts`
  - 配置解析 → `settings-manager` / `resolve-config-value.ts`
  - 路径处理 → `packages/coding-agent/src/core/tools/path-utils.ts`
  - 临时脚本 → 写入临时文件执行后删除，不内联进命令（AGENTS.md 既有规则）
- **新文件行数上限 400 行**（不含类型定义与测试）。超过时必须拆分或给出书面理由；禁止新建超过 800 行的文件。
- **单职责**：一个文件只做一件事。发现一个文件同时承担"解析 + 执行 + 渲染"时，新增逻辑放在独立文件而不是继续追加。
- 禁止为"将来可能用到"预留抽象层、接口、配置项、插件点。只有一个调用方时按 AGENTS.md 规则内联。
- 禁止复制粘贴已有函数的变体；需要变体时给原函数加参数或提取到共享位置。

## 5. 避免臃肿的具体约束

- **净增量约束**：一次功能提交对 `src` 的净增行数超过 300 行时，提交说明必须包含"为什么不能用更少代码实现"的说明。
- **禁止防御性堆叠**：不得为同一输入在不同层重复做校验、日志、包装。校验点只保留一层（工具入口的 schema 校验已覆盖时，调用方不再重复校验）。
- **禁止平行实现**：不得在保留旧路径的同时新增一条做同样事情的路径（如新的会话存储格式与旧格式并存的双写逻辑）。要换就替换（AGENTS.md：不主动保持向后兼容）。
- **死代码即删**：改动导致某导出、函数、分支无任何调用方时，同一提交内删除，不注释掉、不 `// @deprecated`。
- **UI 组件**：interactive 模式新增 UI 元素优先复用 `packages/tui/src/components/` 与 `packages/coding-agent/src/modes/interactive/components/` 现有组件；禁止为单个界面引入新 UI 框架或渲染方案。
- **渲染类重依赖隔离**：`photon-node`（图片）、`grok-mermaid`（图表）、`highlight.js`（高亮）只允许在 `packages/coding-agent/src/utils/` 与现有调用点（`photon.ts`、`syntax-highlight.ts`、`modes/interactive/components/mermaid.ts`）使用，禁止在新代码中直接 import。
- **生成文件**：`packages/ai/src/models.generated.ts` 等生成物只通过对应脚本再生成，不手改（AGENTS.md 既有规则）。

## 6. 新增功能的实现准则

1. **入口最小化**：新功能对外暴露面（导出、CLI 参数、RPC 命令、设置项）取最小集合。每新增一个导出到 `packages/coding-agent/src/index.ts` 都要有消费方。
2. **配置项门槛**：新增设置项需证明存在真实差异化需求；能用合理默认值的不加配置。
3. **状态最小化**：会话（session tree）、设置、扩展状态是既有持久化通道，新功能不得引入新的持久化格式或新的状态文件；确需新格式必须先在方案中与 JSONL session 树做对比论证。
4. **错误处理**：错误只上报一次并带可操作信息；禁止 try/catch 后既吞掉又记录再包装的三层处理。
5. **测试约束**：遵循 AGENTS.md 测试规则；新测试禁止引入真实网络或付费 API；单测文件行数超过被测文件行数 2 倍时说明理由。
6. **文档同步**：新功能涉及用户可见行为时，同步更新 `packages/coding-agent/docs/` 对应文档与 `packages/*/CHANGELOG.md`（仅 main 分支）。

## 7. 可验证门槛（提交前自查）

以下每条都可机械验证，逐条执行：

- [ ] `npm run check` 全绿（含 lint、类型、pinned-deps、runtime-deps、ts-imports、entry-graphs、install-lock）。
- [ ] `grep -rn "from \"@earendil-works/chord\"\|pi-durable\|pi-env" packages/{coding-agent,agent,ai,tui,mcp,codemode}/src` 无结果。
- [ ] 无新增 `any`、无 inline `import()`、无非 erasable TS 语法（AGENTS.md 既有规则）。
- [ ] 新增文件 ≤400 行；净增 >300 行的提交附有缩减说明。
- [ ] `package.json` diff 中每个新依赖都能说出第 3 条的五项满足情况。
- [ ] 测试（新增或受影响的）通过：`node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run test/<file>`。
