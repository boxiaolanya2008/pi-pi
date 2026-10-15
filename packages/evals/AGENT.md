# AGENT.md — @earendil-works/pi-evals

全局规则见根目录 [AGENT.md](../AGENT.md) 与 [AGENTS.md](../AGENTS.md)，本文件只补充本包专属规则。

## 职责

LLM 评测框架：场景定义、评分器、跑批入口（根 package.json 的 `npm run eval`）。仅仓库内部使用。

## 边界（禁止事项）

- 零运行时依赖（package.json `deps` 为空）。评测用到的库一律走 devDependencies 或仓库内包。
- 不是发布 API：禁止被其他包 import，禁止把评测逻辑下沉为共享库。
- 评测用例涉及真实 provider 时必须受 API key 环境变量门控（`skipIf`），与 `./test.sh` 的离线约定一致。

## 编码规则

- 新评测场景必须可确定性重放（固定种子/固定输入），随机性只能来自模型本身。
- 评分器输出必须结构化（分数 + 依据），禁止只打印文本。

## 验收

- `npm run check` 全绿；无 API key 时跑 `./test.sh` 不产生失败。
