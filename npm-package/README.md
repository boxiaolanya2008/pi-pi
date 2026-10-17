# Pi-Pi

Pi-Pi 是 [Pi](https://github.com/earendil-works/pi) 的功能分叉：在原版极简 Agent 框架上新增了一批开箱即用的能力，同时保持轻量。

English: [project README](https://github.com/boxiaolanya2008/pi-pi#readme)

## 安装

本包不发布到 npm registry，从克隆下来的仓库安装：

```bash
npm install --ignore-scripts
npm run install:local
```

Windows 上直接运行仓库根目录的 `install.bat`。加 `--no-build` 可跳过重新构建，只重装现有产物。

需要 Node.js ≥ 22.19。

安装得到的是构建产物的快照，改动源码后需要重新运行一次。整个 agent 已打包为无依赖的自包含产物，安装过程不会从 registry 拉取任何内容。

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
- `/plan`、`/plans`、`/todos`：计划/执行模式由模型自行无缝切换 + 计划文档落盘（`%APPDATA%/.pipi/plan/`）+ 行级模型改写
- `/rewind`：回到某条用户消息，同时回退对话并还原此后被改过的文件；`edit` 可精确逆向，`write`/`bash` 会明确报告为不可回退（会话未保存它们的旧内容），先 dry-run 再写，写前备份到 `.rewind-backup`
- 工作区守卫：工具只能在工作目录内活动（解析符号链接与 `~`），越界调用被拦并给出理由；通过命令写文件被拒绝，改用 `write`/`edit`。是护栏不是沙箱
- 请求裁剪：大段粘贴内容移到 `<agent-dir>/pastes/`，旧工具结果在请求上下文中替换为 stub；都不改动会话。实测粘贴日志省 99%，大段读取历史省 55%
- 图片：粘贴截图、拖入文件或写图片路径都会变成真正的附件
- `reverie` 记忆：`%APPDATA%/.pipi/reverie.md` 单文件累积用户画像，随系统提示词注入（缓存安全）
- 冷启动动画可选：`splashAnimation` = `wave`（默认）/ `logo-pulse` / `particle-storm` / `off`
- 默认系统提示词人设与静态段中文化
- Windows 无 Git Bash 时 `bash` 工具降级到 PowerShell，并提示模型改用对应语法
- 版本检查读取本仓库的 `update.json`，`PI_UPDATE_URL` 可覆盖
- MiniMax-M3.1-Flash-Preview（国际站/国内站直连，adaptive thinking 五档 effort）；MiniMax 模型开放 `xhigh`/`max` 思考等级

## 许可证

MIT（继承上游 Pi；上游版权归 earendil-works 所有）。
