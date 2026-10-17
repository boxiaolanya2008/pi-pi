import type { InlineExtension } from "../core/extensions/types.ts";
import codemodeExtension from "./codemode/index.ts";
import expertTeamExtension from "./expert-team/index.ts";
import llamaExtension from "./llama/index.ts";
import mcpExtension from "./mcp/index.ts";
import planExtension from "./plan/index.ts";
import reverieExtension from "./reverie/index.ts";
import rewindExtension from "./rewind/index.ts";
import toolSearchExtension from "./tool-search/index.ts";
import workspaceGuardExtension from "./workspace-guard/index.ts";

export const builtInExtensions: InlineExtension[] = [
	{ name: "llama.cpp", factory: llamaExtension, builtin: true },
	{ name: "expert-team", factory: expertTeamExtension, builtin: true },
	{ name: "plan", factory: planExtension, builtin: true },
	{ name: "rewind", factory: rewindExtension, builtin: true },
	{ name: "reverie", factory: reverieExtension, builtin: true },
	// Runs first among the built-ins it can affect: the guard blocks before any tool executes.
	{ name: "workspace-guard", factory: workspaceGuardExtension, builtin: true },
	// Replaceable: an extension that registers `codemode`, `tool_search`, or `/mcp` (such as a third-party
	// MCP extension) takes over instead of running alongside the built-in one.
	{ name: "codemode", factory: codemodeExtension, replaceable: true, builtin: true },
	{ name: "tool-search", factory: toolSearchExtension, replaceable: true, builtin: true },
	{ name: "mcp", factory: mcpExtension, replaceable: true, builtin: true },
];
