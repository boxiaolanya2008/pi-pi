# Pi Desktop

A desktop shell for the Pi coding agent, for Windows and Linux.

This is a shell, not a second implementation. It embeds the same agent through the SDK's
`createAgentSession()`, so tools, settings, sessions, extensions, skills, and themes behave exactly as
they do in the terminal. Anything the terminal can do, this can do; what it does not add is a second
place for that behaviour to live.

## Why Electron, and why in-process

**Electron** rather than Tauri because the whole repository is TypeScript and this is a shell: a Rust
toolchain would add a second language and a second build for code that only forwards events. Electron
also bundles its runtime, so the Linux build does not depend on a particular system WebKit version.

**The agent runs in the main process** rather than behind an RPC child process. There is one runtime to
install and one to debug, and the session's events already carry everything the window needs. The trade is
that a crash in the agent takes the window with it, which is acceptable at this size and can be revisited
if it bites.

**Electron 38** is required, not incidental: 33 ships Node 20, which has no `fs.globSync`, and the SDK uses
it. The smoke test below is what caught that.

## Layout

```
src/main.ts              Electron main: window, session, IPC
src/preload.ts           the only bridge the window gets
src/shared.ts            the contract both sides import
src/renderer/            the window: transcript, composer, styles
scripts/build.mjs        three bundles plus asset copy
scripts/smoke.mjs        boots the real runtime and probes it
```

The window is untrusted: `contextIsolation` on, `nodeIntegration` off, `sandbox` on, a CSP that allows
only bundled scripts, and navigation pinned to the bundled page. It reaches the agent only through the
`PiBridge` interface in `shared.ts`. Message text is inserted with `textContent`, never `innerHTML`,
because message content is whatever the model or a tool produced.

## Develop

```bash
npm install            # from the repository root
npm run build --workspace apps/desktop
npm start   --workspace apps/desktop
```

`npm start` builds first, so a stale bundle cannot be what you are looking at.

## Verify

```bash
npm run typecheck --workspace apps/desktop
npm run smoke     --workspace apps/desktop
```

The smoke test is the one that matters. A passing build proves nothing on its own: it launches the real
Electron runtime, starts a real session, and asserts that the renderer actually painted.

## Package

```bash
npm run dist:win    --workspace apps/desktop    # NSIS installer
npm run dist:linux  --workspace apps/desktop    # AppImage and deb
```

Linux output has not been produced or tested here; only the configuration is in place.

## Not done yet

- No sessions list, model picker, or settings UI; the window takes the model and settings from the same
  files the terminal reads.
- No streaming of tool-call arguments; tool calls appear once a turn settles.
- No image attachments through the composer, though the agent supports them.
- `apps/desktop` is not part of `npm run check`, so nothing gates it yet. It has its own typecheck and
  smoke test; wiring it into the root check is the next step.
