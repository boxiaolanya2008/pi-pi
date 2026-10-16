<p align="center">
  <img alt="Pi-Pi logo" src="icon/logo.svg" width="128">
</p>

<h1 align="center">Pi-Pi</h1>

**English** | [简体中文](README.zh-CN.md)

Pi-Pi is a lightweight fork of the Pi coding agent. It keeps Pi's minimal, extensible core and ships a set of ready-to-use features on top — with no added dependencies and no bundle growth.

## Features

- **Guided model setup** — first-run setup lets you configure a custom API base URL, model ID, and API key; saved to `models.json` and set as default.
- **Expert team** — `/experts <question>` runs independent model conversations per expert persona (architect, skeptic, implementer) in parallel, then merges them into a synthesis. `/experts` browses past transcripts.
- **Plan / agent mode switching** — the model switches between plan mode (read-only design) and agent mode (full write access) by itself with the `plan_mode` tool; `save_plan` persists the Markdown plan to `%APPDATA%/.pipi/plan/<workspace>/`. `/plan <topic>` enters plan mode and hands you a designed plan, `/plan` toggles the mode. `/plans` opens saved plans for line-level editing where the model rewrites the selected line (Ctrl+Z reverts); `/todos` shows the todo list with a progress widget.
- **Reverie memory** — a single append-only profile at `%APPDATA%/.pipi/reverie.md` accumulates what the model learns about you. The snapshot is injected once per session as a static system-prompt section, so prompt caching is never invalidated; a standing reminder makes the model append one sentence per turn.
- **Cold-start splash** — a theme-colored wave animation plays over the real loading window and disappears the moment the editor is interactive; zero added latency.
- **Chinese persona** — the default system prompt uses a minimalist multi-module architect persona with translated static sections.
- **Thinking display** — dedicated collapsible thinking blocks with click-to-toggle.
- **MiniMax support** — `MiniMax-M3.1-Flash-Preview` on the direct `minimax` / `minimax-cn` providers with adaptive-thinking effort ladder (`low` to `max`), plus `xhigh`/`max` thinking levels for MiniMax reasoning models.

## Install

```bash
npm install -g @boxiaolanya2008/pi-pi
```

Requires Node.js 22.19+. On Windows you can also run [install.bat](install.bat). Or from source:

```bash
npm install --ignore-scripts
npm run build
./pi-test.sh        # run from sources (Windows: pi-test.ps1)
```

## Quick start

```bash
cd /path/to/project
pipi                # or: pi-pi
```

Configuration stays compatible with upstream Pi: settings, `models.json`, auth, sessions, extensions, skills, and themes all live in `~/.pi` as before.

## Documentation

Full upstream documentation ships with the CLI and the repo: [packages/coding-agent/docs/](packages/coding-agent/docs/) (extensions, skills, themes, RPC, SDK, providers, and more).

## License

MIT. Upstream Pi is © earendil-works.
