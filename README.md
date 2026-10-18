<p align="center">
  <img alt="Pi-Pi logo" src="icon/logo.svg" width="128">
</p>

<h1 align="center">Pi-Pi</h1>

**English** | [简体中文](README.zh-CN.md)

Pi-Pi is a lightweight fork of the Pi coding agent. It keeps Pi's minimal, extensible core and ships a set of ready-to-use features on top — with no added dependencies and no bundle growth.

## Features

- **Guided model setup** - first-run setup lets you configure a custom API base URL, model ID, and API key; saved to `models.json` and set as default. `/login` offers a Custom API endpoint option as well: after the base URL, API type, and key, it fetches the model list from the endpoint (`/models` for OpenAI-compatible, `/v1/models` for Anthropic-compatible) and falls back to a manually entered model ID.
- **Expert team** - `/experts <question>` runs independent model conversations per expert persona (architect, skeptic, implementer) in parallel, then merges them into a synthesis. `/experts` browses past transcripts.
- **Plan / agent mode switching** - the model switches between plan mode (read-only design) and agent mode (full write access) by itself with the `plan_mode` tool; `save_plan` persists the Markdown plan to `%APPDATA%/.pipi/plan/`. `/plan <topic>` enters plan mode and hands you a designed plan, `/plan` toggles the mode. `/plans` opens saved plans for line-level editing where the model rewrites the selected line (Ctrl+Z reverts); `/todos` shows the todo list with a progress widget.
- **Rewind** - `/rewind` lists the user messages on the active branch and goes back to one you pick, moving the conversation and restoring files edited since. `edit` calls are reversed exactly, because the session recorded both sides of each replacement; `write` and `bash` are reported as not reversible, since the session never stored their previous content. A dry run lists every file first, nothing is written until you confirm, and each written file is copied to `.rewind-backup`.
- **Workspace guard** - tools stay inside the working directory, resolved through symlinks and `~`, and a call that reaches outside is blocked with a reason the model can act on. Shell commands that write files are refused in favour of the `write` and `edit` tools. A guard rail rather than a sandbox, and it says so.
- **Request trims** - a large pasted block moves to `<agent-dir>/pastes/` and the message points at it; old tool results are replaced by a stub in the request context. Neither touches the session, so the transcript, `/rewind`, and export still show everything. Measured: 99% off a pasted log, 55% off a history of large reads.
- **Images** - a pasted screenshot, a dropped file, or a typed path to a supported image becomes a real attachment instead of a line of text.
- **Selectable splash** - `splashAnimation` picks `wave` (default, unchanged), `logo-pulse`, or `particle-storm`, or `off`.
- **Reverie memory** - a single append-only profile at `%APPDATA%/.pipi/reverie.md` accumulates what the model learns about you. The snapshot is injected once per session as a static system-prompt section, so prompt caching is never invalidated; a standing reminder makes the model append one sentence per turn.
- **Chinese persona** - the default system prompt uses a minimalist multi-module architect persona with translated static sections.
- **Thinking display** - dedicated collapsible thinking blocks with click-to-toggle.
- **Matches the platform shell** - on Windows without Git Bash the `bash` tool falls back to PowerShell and tells the model which command syntax to use, so its first command succeeds.
- **Updates from this repository** - the version check reads `update.json` from this repository; `PI_UPDATE_URL` overrides it for a mirror.
- **MiniMax support** - `MiniMax-M3.1-Flash-Preview` on the direct `minimax` / `minimax-cn` providers with adaptive-thinking effort ladder (`low` to `max`), plus `xhigh`/`max` thinking levels for MiniMax reasoning models.

## Install

This package is not published to a registry. Install it from a clone:

```bash
npm install --ignore-scripts
npm run install:local      # build, refresh npm-package/, then install globally
```

On Windows, run [install.bat](install.bat) instead. Add `--no-build` to reinstall the existing build without rebuilding, or run `install.bat --no-build` for the same on Windows.

Requires Node.js 22.19+.

The install is a snapshot of the built sources, so run it again after changing the code. Nothing is fetched from a registry: the agent is bundled into a self-contained package with no dependencies.

To run without installing:

```bash
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
