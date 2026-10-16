<div align="center">
  <img alt="Pi-Pi logo" src="icon/logo.svg" width="128">
</div>

<h1 align="center">Pi-Pi</h1>

<div align="center">

[English](README.md) | **简体中文**

</div>

Pi-Pi 是 Pi 编程 Agent 的轻量分叉：保留 Pi 极简、可扩展的内核，在其上开箱即用一组实用功能——零新增依赖，产物体积零增长。

## 功能

- **引导式模型配置** — 首次运行即可配置自定义 API 地址、模型 ID 与 Key，落盘 `models.json` 并设为默认模型。
- **专家团** — `/experts <问题>` 为每位专家人格（架构师/怀疑论者/实现者）并行发起独立模型会话，再汇总为综合意见；`/experts` 可回看历史记录。
- **计划模式** — `/plan <主题>` 用当前模型起草 Markdown 计划并保存到 `~/pipi/plan/<工作区>/`；经你确认后才从清单生成 TODO。`/plans` 打开已存计划做行级编辑——选中一行让模型仅重写该行（Ctrl+Z 可回退）；`/todos` 查看列表与进度挂件。
- **Reverie 记忆** — 单文件追加式用户画像 `~/pipi/reverie.md`，持续积累模型对你的理解。快照以静态系统提示词 section 注入，每会话一次，不破坏提示词缓存；常驻提醒让模型每轮追加一句话。
- **冷启动动画** — 主题色波浪覆盖真实加载窗口，编辑器可交互即消失，零额外延迟。
- **中文人设** — 默认系统提示词为极简主义多模块架构师人设，静态段同步中文化。
- **思考过程展示** — 独立的可折叠思考块组件，点击展开/收起。
- **MiniMax 支持** — `MiniMax-M3.1-Flash-Preview` 直连国际站/国内站（adaptive thinking，`low`–`max` 五档 effort）；MiniMax 推理模型开放 `xhigh`/`max` 思考等级。

## 安装

```bash
npm install -g @boxiaolanya2008/pi-pi
```

需要 Node.js 22.19+。Windows 也可直接运行 [install.bat](install.bat)。或从源码运行：

```bash
npm install --ignore-scripts
npm run build
./pi-test.sh        # 源码直跑（Windows 用 pi-test.ps1）
```

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
