<div align="center">
  <img alt="Pi-Pi logo" src="icon/logo.svg" width="128">
</div>

<h1 align="center">Pi-Pi</h1>

<div align="center">

[English](README.md) | **简体中文**

</div>

Pi-Pi 是 Pi 编程 Agent 的轻量分叉：保留 Pi 极简、可扩展的内核，在其上开箱即用一组实用功能——零新增依赖，产物体积零增长。

## 功能

- **引导式模型配置** - 首次运行即可配置自定义 API 地址、模型 ID 和 Key，落到 `models.json` 并设为默认模型。
- **专家团** - `/experts <问题>` 为每位专家人格（架构师 / 怀疑论者 / 实现者）并行发起独立模型会话，再汇总为综合意见；`/experts` 可回看历史记录。
- **计划 / 执行模式无缝切换** - 模型自己通过 `plan_mode` 工具在计划模式（只读设计）与执行模式（完整写权限）间切换；`save_plan` 把 Markdown 计划落盘到 `%APPDATA%/.pipi/plan/`。`/plan <主题>` 进入计划模式并交给你一份设计，`/plan` 直接切换。`/plans` 打开已存计划做行级编辑（Ctrl+Z 可回退）；`/todos` 查看列表与进度挂件。
- **回退** - `/rewind` 列出当前分支上的用户消息，选中后同时回退对话并还原此后被改过的文件。`edit` 可精确逆向，因为会话记录了两侧文本；`write` 与 `bash` 会明确报告为不可回退，因为会话从未保存它们的旧内容。先跑 dry-run，确认后才写文件，且每个被写入的文件先备份到 `.rewind-backup`。
- **工作区守卫** - 工具只能在工作目录内活动，符号链接与 `~` 都会被解析后比较；越界调用会被拦下并给出可操作的理由。通过命令写文件会被拒绝，改用 `write` / `edit`。这是护栏不是沙箱，文档如实说明。
- **请求裁剪** - 大段粘贴内容移到 `<agent-dir>/pastes/`，消息里只留引用；过旧的工具结果在请求上下文中替换为 stub。两者都不改动会话，transcript、`/rewind`、导出仍然完整。实测：粘贴日志省 99%，大段读取历史省 55%。
- **图片** - 粘贴截图、拖入文件、或直接写图片路径，都会变成真正的附件，而不是一行文本。
- **可选冷启动动画** - `splashAnimation` 可选 `wave`（默认，与原效果逐字节一致）、`logo-pulse`、`particle-storm`，或 `off`。
- **Reverie 记忆** - 单文件追加式用户画像 `%APPDATA%/.pipi/reverie.md`，持续积累模型对你的理解。快照以静态系统提示词 section 每会话注入一次，不破坏提示词缓存；常驻提醒让模型每轮追加一句话。
- **中文人设** - 默认系统提示词为极简主义多模块架构师人设，静态段同步中文化。
- **思考过程展示** - 独立的可折叠思考块组件，点击展开/收起。
- **跟随平台 shell** - Windows 上无 Git Bash 时 `bash` 工具降级到 PowerShell，并告诉模型该用哪种命令语法，让第一条命令就成功。
- **从本仓库更新** - 版本检查读取本仓库的 `update.json`；`PI_UPDATE_URL` 可覆盖为镜像地址。
- **MiniMax 支持** - `MiniMax-M3.1-Flash-Preview` 直连国际站/国内站（adaptive thinking，`low`-`max` 五档 effort）；MiniMax 推理模型开启 `xhigh`/`max` 思考等级。

## 安装

本包不发布到任何 npm registry，从克隆的仓库安装：

```bash
npm install --ignore-scripts
npm run install:local      # 构建 → 刷新 npm-package/ → 全局安装
```

Windows 直接运行 [install.bat](install.bat)；加 `--no-build` 可跳过构建、只重装现有产物。

需要 Node.js 22.19+。安装得到的是构建产物的快照，改动源码后需要重新运行一次。

## 快速开始

```bash
cd /path/to/project
pipi                # 或 pi-pi
```

配置与上游 Pi 完全兼容：settings、`models.json`、auth、会话、扩展、技能、主题仍在 `~/.pi`，原样可用。

## 文档

上游完整文档随 CLI 与仓库分发：[packages/coding-agent/docs/](packages/coding-agent/docs/)（扩展、技能、主题、RPC、SDK、provider 等）。

## 许可证

MIT。上游 Pi 版权归 earendil-works 所有。
