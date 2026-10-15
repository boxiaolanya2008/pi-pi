<div align="center">
  <a href="https://pi.dev">
    <img alt="pi logo" src="icon/logo.svg" width="128">
  </a>
</div>

<h1 align="center">Pi</h1>

<div align="center">

**English** | [简体中文](README.zh-CN.md)

</div>

> 新贡献者提交的 Issue 和 PR 默认会被自动关闭，由维护者每天人工复核。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

# Pi 是什么

Pi 是一个克制的、可完全按你的习惯改造的编程 Agent 框架。

它不想规定你的工作流——而是反过来，让你把 Pi 改成自己顺手的形状。通过[扩展](packages/coding-agent/docs/extensions.md)、[技能](packages/coding-agent/docs/skills.md)、[提示词模板](packages/coding-agent/docs/prompt-templates.md)和[主题](packages/coding-agent/docs/themes.md)定制它，再打包成 [Pi 包](packages/coding-agent/docs/packages.md)，通过 npm 或 git 分享。

Pi 自带一套够用的默认能力，但刻意不做子代理、计划模式这类功能——你想要，就让 Pi 自己把它造出来，或者装一个别人做好的包。

用法上很灵活：可以[交互式](packages/coding-agent/docs/usage.md)使用，可以在脚本里跑[打印或 JSON 模式](packages/coding-agent/docs/cli.md)，可以走 [RPC](packages/coding-agent/docs/rpc.md) 远程控制，也可以用 [TypeScript SDK](packages/coding-agent/docs/sdk.md) 把 Pi 嵌进自己的应用。[OpenClaw](https://github.com/OpenClaw/OpenClaw) 就是一个真实落地的集成案例。

## 快速开始

安装命令行工具：

```bash
curl -fsSL https://pi.dev/install.sh | sh
```

Windows（PowerShell）：

```shell
powershell -c "irm https://pi.dev/install.ps1 | iex"
```

安装器会锁定所有依赖版本，之后用 `pi update` 升级。也可以直接用 npm 装（这种方式不会锁定间接依赖）：

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

Pi 需要 Node.js 22.19 或更高版本；macOS、Linux 和 Windows 的安装脚本在缺 Node 时会自动装好。正常的 npm 安装不依赖任何生命周期脚本。

在你想让它干活的项目目录里启动：

```bash
cd /path/to/project
pi
```

首次使用内置 provider 的话，在 Pi 里输入 `/login` 登录订阅账号或填 API Key，然后直接给它派活就行。

完整的安装与使用说明见[官方文档](https://pi.dev/docs/latest)，演示视频在 [pi.dev](https://pi.dev)。

## 用 Nix 运行

```bash
nix run github:earendil-works/pi/stable
```

`stable` 指向最新发布版。用 `nix profile add github:earendil-works/pi/stable` 安装、`nix profile upgrade pi` 升级；也可以钉死某个版本（如 `github:earendil-works/pi/v1.0.0`），或者用 `github:earendil-works/pi` 跟踪 main 分支的未发布改动。Nix 从源码构建。

支持 Linux 与 macOS 的 ARM64 和 x86-64。`nix build .` 构建，`nix run .` 运行本地检出。

Nix 构建是离线的，模型数据取自 `nix/model-catalog.json` 中钉住的 pi.dev 目录版本；运行时 Pi 照常从 pi.dev 叠加更新的目录数据。当 main 上的改动（比如新增 provider 或模型类型）导致 pin 失配时，Nix 工作流会自动替换 pin。也可以手动刷新：

```bash
npm run update:model-catalog-pin
```

## 仓库里的包

这个 monorepo 包含 Pi CLI 及其支撑库。

| 包 | 说明 |
|---------|-------------|
| **[@earendil-works/chord](packages/chord)** | 支持热重载插件、契约、复制状态与 JSON 链路 RPC 的类型化宿主运行时 |
| **[@earendil-works/pi-telemetry](packages/telemetry)** | 中立厂商的遥测契约、参考适配器、一致性测试与类型化 schema |
| **[@earendil-works/pi-ai](packages/ai)** | 统一的多 provider LLM API（OpenAI、Anthropic、Google 等） |
| **[@earendil-works/pi-durable](packages/durable)** | 持久化的会话、任务与文档运行时 |
| **[@earendil-works/pi-agent-core](packages/agent)** | 带工具调用与状态管理的 Agent 运行时 |
| **[@earendil-works/pi-coding-agent](packages/coding-agent)** | 交互式编程 Agent CLI |
| **[@earendil-works/pi-tui](packages/tui)** | 差分渲染的终端 UI 库 |

Slack/聊天自动化与工作流见 [earendil-works/pi-chat](https://github.com/earendil-works/pi-chat)。

## 权限与容器化

Pi 内置不提供限制文件系统、进程、网络或凭据访问的权限系统；默认情况下，它以启动它的用户和进程的权限运行。

如果需要更强的边界，请把 Pi 容器化或沙箱化。[packages/coding-agent/docs/containerization.md](packages/coding-agent/docs/containerization.md) 介绍了三种模式：

- **Gondolin 扩展**：`pi` 和 provider 认证留在宿主机，把内置工具和 `!` 命令路由进本地 Linux micro-VM。
- **普通 Docker**：把整个 `pi` 进程跑进本地容器，做简单隔离。
- **OpenShell**：把整个 `pi` 进程跑进策略可控的沙箱。

## 参与贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md) 的贡献指南，以及 [AGENTS.md](AGENTS.md) 的项目专属规则（对人和 Agent 都适用）。Pi 的长期规划在 [RFC](https://rfc.earendil.com/keyword/pi/) 里。

## 开发

```bash
npm install --ignore-scripts  # 安装全部依赖，不执行生命周期脚本
npm run build         # 刷新模型数据，然后构建所有包
npm run build:offline # 不联网，用已有的模型数据重新构建
npm run check         # Lint、格式化与类型检查
./test.sh            # 跑测试（没有 API Key 时自动跳过依赖 LLM 的用例）
./pi-test.sh         # 直接从源码运行 Pi（任意目录下都能执行）
```

Windows 下源码直跑用 `pi-test.ps1` 或 `pi-test.bat`。

### 在 monorepo 之外使用本地包

先把所有公开包构建成一整套一致的本地产物：

```bash
npm run pack:packages -- --out .artifacts/pi-packages
```

这一步会先刷新模型数据再构建 `pi-ai`。模型数据已就绪时想完全离线，加 `--offline-model-data`。

然后让外部项目引用其中一个包，并从同一套产物解析全部 Pi 依赖。npm 是默认方式：

```bash
node scripts/use-local-packages.mjs \
  --manifest .artifacts/pi-packages/manifest.json \
  --consumer ../my-project \
  --package @earendil-works/pi-durable \
  --package @earendil-works/pi-agent-core
cd ../my-project
npm install --ignore-scripts
```

pnpm 项目则把 `--consumer` 指向 workspace 根目录：

```bash
node scripts/use-local-packages.mjs \
  --manifest .artifacts/pi-packages/manifest.json \
  --consumer ../my-project \
  --package @earendil-works/pi-agent-core \
  --package-manager pnpm
cd ../my-project
pnpm install --ignore-scripts
```

每加一个直接依赖就重复一次 `--package`。命令会把内容寻址的本地 `file:` 引用写进 consumer 的 `package.json`：npm 的传递覆盖写进 `package.json`，pnpm 的写进 `pnpm-workspace.yaml`。安装或更新依赖期间请保持产物目录可用。Pi 源码有改动后，两条命令都要重跑。

## 从发布源码构建独立二进制

GitHub Release 附带带版本号的源码压缩包，其校验和记录在 Release 的 `SHA256SUMS` 文件里。解压后跑与官方独立二进制相同的构建脚本：

```bash
VERSION="<release-version>"
tar -xzf "pi-${VERSION}-source.tar.gz"
cd "pi-${VERSION}"
./scripts/build-binaries.sh --offline-model-data --platform linux-x64 --out "$PWD/out"
```

压缩包内含发布版模型数据与原生预编译产物。`--offline-model-data` 直接使用内置模型数据，不刷新 provider 目录。脚本会自行安装依赖并用运行时资产构建可执行文件；依赖已就绪时传 `--skip-install` 跳过。

## 供应链加固

我们把 npm 依赖变更当作需要评审的代码变更来对待。

- 直接外部依赖精确锁版本；内部 workspace 包保持版本区间。
- `.npmrc` 设置了 `save-exact=true` 和 `min-release-age=2`，避免 npm 解析时命中当天刚发布的依赖。
- `package-lock.json` 是依赖的唯一事实来源。预提交钩子会拦截意外的 lockfile 提交，除非设置 `PI_ALLOW_LOCKFILE_CHANGE=1`。
- `npm run check` 会校验直接依赖锁版本、原生 TypeScript import 兼容性，以及生成的 coding-agent 安装锁。
- pi.dev 安装器从 `packages/coding-agent/install-lock/`（由根 lockfile 生成）安装，锁定间接依赖；npm 包本身不锁间接依赖。
- 本地发布冒烟测试与 npm 发布使用同一套 tarball 打包器；npm 发布的是验证过的 tarball，而不是重新打包的 workspace 目录。
- 本地发布安装、文档写明的 npm 安装、`pi update --self`，在支持的场景下都用 `--ignore-scripts`。
- CI 用 `npm ci --ignore-scripts` 安装；另有定时 GitHub 工作流跑 `npm audit --omit=dev` 和 `npm audit signatures --omit=dev`。
- 安装锁生成脚本对依赖生命周期脚本设有显式白名单；带生命周期脚本的新依赖过不了检查，必须先人工评审。

## 分享你的 OSS 编程 Agent 会话

如果你在用 Pi 或其他编程 Agent 做开源工作，欢迎分享会话。

公开的 OSS 会话数据能帮助改进编程 Agent：真实的任务、工具调用、失败与修复，比玩具基准测试有价值得多。

完整的说明见 [X 上的这篇帖子](https://x.com/badlogicgames/status/2037811643774652911)。

发布会话用 [`badlogic/pi-share-hf`](https://github.com/badlogic/pi-share-hf)，README 有配置步骤。你只需要一个 Hugging Face 账号、Hugging Face CLI 和 `pi-share-hf`。

也可以看[这个视频](https://x.com/badlogicgames/status/2041151967695634619)，里面演示了我怎么发布自己的 `pi-mono` 会话。

我自己的 `pi-mono` 工作会话会定期发布在这里：

- [badlogicgames/pi-mono on Hugging Face](https://huggingface.co/datasets/badlogicgames/pi-mono)

## 许可证

MIT

<p align="center">
  <a href="https://pi.dev">pi.dev</a> 域名由
  <br /><br />
  <a href="https://exe.dev"><img src="packages/coding-agent/docs/images/exy.png" alt="Exy mascot" width="48" /><br />exe.dev</a>
  慷慨捐赠
</p>
