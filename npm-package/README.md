# Pi-Pi

Pi-Pi 是 [Pi](https://github.com/earendil-works/pi) 的功能分叉：在原版极简 Agent 框架上新增了一批开箱即用的能力，同时保持轻量。

English: [project README](https://github.com/boxiaolanya2008/pi-pi#readme)

## 安装

```bash
npm install -g @boxiaolanya2008/pi-pi
```

需要 Node.js ≥ 22.19。

## 使用

在目标项目目录里启动（命令为 `pipi` 或 `pi-pi`）：

```bash
cd /path/to/project
pipi
```

配置与上游 Pi 完全兼容：配置目录仍是 `~/.pi`（settings.json / models.json / auth.json），会话、扩展、技能、主题机制原样可用。

## 相对上游 Pi 的差异

- 首次引导可直接配置自定义 API / 模型 / Key（写入 models.json）
- `/experts`：专家团——多专家独立会话并行作答并汇总
- `/plan`、`/plans`、`/todos`：计划/执行模式由模型自行无缝切换 + 计划文档落盘 + 行级模型改写
- `reverie` 记忆：`%APPDATA%/.pipi/reverie.md` 单文件累积用户画像，随系统提示词注入（缓存安全）
- 冷启动波浪动画
- 默认系统提示词人设与静态段中文化
- MiniMax-M3.1-Flash-Preview（国际站/国内站直连，adaptive thinking 五档 effort）；MiniMax 模型开放 `xhigh`/`max` 思考等级

## 许可证

MIT（继承上游 Pi；上游版权归 earendil-works 所有）。
