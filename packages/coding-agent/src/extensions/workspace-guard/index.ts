/**
 * Keeps the model inside the project it was started in.
 *
 * Every tool that takes a path is checked before it runs: `read`, `write`, `edit`, `grep`, `find`, `ls`,
 * and the `command` of `bash` and `powershell`. A call that reaches outside the workspace is blocked with
 * a reason the model can act on, so it retries inside the project instead of failing at the filesystem.
 *
 * This is a guard, not a sandbox. `docs/security.md` is explicit that tool calls run with the permissions
 * of the Pi process, and that does not change here: a shell command can still reach outside once it runs,
 * and the token scan for shell commands is a heuristic that skips flags and URLs rather than guessing at
 * them. What this buys is discipline, not isolation — ordinary work stays in one project.
 *
 * Configuration rides on environment variables because `ExtensionContext` exposes no settings handle, and
 * adding one would change the public extension API for a single toggle:
 * - `PI_RESTRICT_TO_WORKSPACE=0` (or `false`/`no`) turns the guard off.
 * - `PI_WORKSPACE_EXTRA_ROOTS` adds allowed trees, separated by the platform path delimiter.
 */

import { delimiter, resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolCallEvent } from "../../core/extensions/types.ts";
import { describeToken, expandHome, findPathTokens, isInside } from "./paths.ts";

/** Tools whose `path` input must stay inside the workspace. */
const PATH_TOOLS = new Set(["read", "write", "edit", "grep", "find", "ls"]);
/** Tools whose `command` input is scanned for out-of-workspace paths. */
const SHELL_TOOLS = new Set(["bash", "powershell"]);

interface Blocked {
	toolName: string;
	target: string;
	reason: string;
}

/** Extra allowed trees from `PI_WORKSPACE_EXTRA_ROOTS`, resolved against the workspace. */
function extraRoots(cwd: string): string[] {
	const configured = process.env.PI_WORKSPACE_EXTRA_ROOTS?.trim();
	if (!configured) return [];
	return configured
		.split(delimiter)
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => resolve(cwd, entry));
}

/** The guard is on unless it is explicitly turned off. */
function isEnabled(): boolean {
	const value = process.env.PI_RESTRICT_TO_WORKSPACE?.trim().toLowerCase();
	return !(value === "0" || value === "false" || value === "no");
}

/**
 * Why a path may not be used, or undefined when it may.
 *
 * Relative paths resolve against `cwd`, so `../other/file` is caught even though it never looks absolute.
 * A leading `~` expands to the home directory, matching how the file tools resolve it.
 */
function rejectPath(target: string, roots: readonly string[], cwd: string): string | undefined {
	const absolute = expandHome(target) ?? resolve(cwd, target);
	if (roots.some((root) => isInside(root, absolute))) return undefined;
	return `"${target}" is outside the workspace (${cwd}). Work inside the project, or ask the user to allow the directory with PI_WORKSPACE_EXTRA_ROOTS.`;
}

function checkPathTool(event: ToolCallEvent, roots: readonly string[], cwd: string): Blocked | undefined {
	if (!PATH_TOOLS.has(event.toolName)) return undefined;
	const input = event.input as { path?: unknown };
	// A missing path defaults to the workspace itself, which is always allowed.
	if (typeof input.path !== "string" || input.path.length === 0) return undefined;
	const reason = rejectPath(input.path, roots, cwd);
	return reason ? { toolName: event.toolName, target: input.path, reason } : undefined;
}

function checkShellTool(event: ToolCallEvent, roots: readonly string[], cwd: string): Blocked | undefined {
	if (!SHELL_TOOLS.has(event.toolName)) return undefined;
	const input = event.input as { command?: unknown };
	if (typeof input.command !== "string" || input.command.length === 0) return undefined;

	for (const token of findPathTokens(input.command)) {
		const candidate = describeToken(token, cwd);
		if (candidate.unresolved) {
			return {
				toolName: event.toolName,
				target: token,
				reason: `${token} ${candidate.unresolved}. Work inside the project (${cwd}).`,
			};
		}
		if (!roots.some((root) => isInside(root, candidate.resolved!))) {
			return {
				toolName: event.toolName,
				target: token,
				reason: `${token} resolves outside the workspace (${cwd}). Work inside the project, or ask the user to allow the directory with PI_WORKSPACE_EXTRA_ROOTS.`,
			};
		}
	}
	return undefined;
}

export default function workspaceGuardExtension(pi: ExtensionAPI): void {
	pi.on("tool_call", async (event, ctx: ExtensionContext) => {
		if (!isEnabled()) return undefined;

		const cwd = ctx.cwd;
		const roots = [cwd, ...extraRoots(cwd)];
		const blocked = checkPathTool(event, roots, cwd) ?? checkShellTool(event, roots, cwd);
		if (!blocked) return undefined;

		ctx.ui.notify(`Blocked ${blocked.toolName}: ${blocked.target}`, "warning");
		return { block: true, reason: `Workspace guard: ${blocked.reason}` };
	});
}
