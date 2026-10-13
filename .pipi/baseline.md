# 基线指标（阶段 0 产物，构建于 2026-10-13）

构建命令：`npm install --ignore-scripts` → `npm run hydrate:model-data` → `npm run build`
环境：Windows / Node 22，dist 为 tsc+esbuild 常规产物。

## 包体积（dist，KB）

| 包 | 体积 |
|---|---|
| coding-agent（含 bundle 8.8 MiB / 80 文件） | 19.9 MB |
| ai | 5.3 MB |
| durable | 3.6 MB |
| tui | 2.4 MB |
| chord | 1.6 MB |
| codemode | 0.4 MB |
| mcp | 0.5 MB |
| agent | 0.3 MB |
| env | 0.3 MB |
| telemetry | 0.1 MB |
| **合计** | **34.5 MB** |

## 冷启动耗时（node dist/bundle/cli.js --version，5 次）

| 次数 | 耗时 |
|---|---|
| run1 | 908 ms |
| run2 | 639 ms |
| run3 | 602 ms |
| run4 | 642 ms |
| run5 | 665 ms |

中位数约 642 ms，稳态 600~670 ms。

## 验收对照口径（阶段 6）

- 体积：`du -sk packages/*/dist` 对比，bundle 体积对比 `dist/bundle`。
- 冷启动：同命令 5 次取中位数。
- 源码增量：新功能文件行数合计（对照 AGENT.md 净增量约束）。

## 阶段 6 对比结果（2026-10-13，全部功能落地后）

| 指标 | 基线 | 落地后 | 结论 |
|---|---|---|---|
| bundle（esbuild 报告） | 8.8 MiB / 80 files | 8.8 MiB / 80 files | 无增长（新代码并入既有 chunk） |
| dist 合计 | 34.5 MB | 34.8 MB | du 块大小取整差异，bundle 不变 |
| 冷启动中位数 | 642 ms | 648 ms | 噪声范围内，无回归 |
| 新增直接依赖 | — | 0 | 全部复用现有依赖 |
| `npm run check` | — | exit 0 | lint/类型/依赖守门全绿 |

源码增量：8 个新文件 + 3 个修改文件，约 1200 行；单文件最大 ~340 行（< AGENT.md 400 行上限）。

### 运行走查清单（待人工验证）

1. 首次运行（`PI_EXPERIMENTAL=1` 且无 settings.json）→ 引导对话框出现 theme → analytics → model 配置；完成后 `~/.pi/models.json` 出现 `custom` provider，settings.json 出现 defaultProvider/defaultModel，重启后 `/model` 可见并默认选中。
2. `/experts <问题>` → 状态栏出现 "experts consulting..." → 会话内出现分专家回答 + Synthesis；`/experts` 可回看历史。
3. `/plan <主题>` → 计划 MD 落盘 `~/pipi/plan/--工作区example--/` → 确认前无 TODO → 确认后编辑器下方出现 todo widget；`/todos` 打开列表。
4. `/plans` → 选文档 → ↑↓ 选行 → Enter 输入修改要求 → 该行被模型重写并写回文件；Ctrl+Z 回退。
5. 启动时 fd/rg 下载与扩展加载窗口出现主题色波浪动画，编辑器可用即消失。

