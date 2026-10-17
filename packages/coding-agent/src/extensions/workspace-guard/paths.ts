/**
 * Workspace containment checks.
 *
 * A guard, not a sandbox. It stops the model from wandering into other projects through the tools and
 * through obviously out-of-tree command arguments. It cannot stop a shell: any command may reach outside
 * the workspace once it runs, so `docs/security.md` still applies. The point is to keep ordinary work
 * inside one project rather than to withstand a hostile command.
 *
 * Paths are canonicalized before comparing, so a symlink pointing out of the workspace is caught instead
 * of being trusted for its name. Nonexistent paths are canonicalized through their nearest existing
 * ancestor, which is what a `write` to a new file needs.
 */

import { realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** Windows compares paths case-insensitively; every other platform is case-sensitive. */
const CASE_INSENSITIVE = process.platform === "win32" || process.platform === "darwin";

function normalizeForCompare(path: string): string {
	const normalized = path.replace(/[\\/]+/g, sep);
	return CASE_INSENSITIVE ? normalized.toLowerCase() : normalized;
}

/** Resolve symlinks in the longest existing prefix, then re-append the rest. */
function canonicalize(path: string): string {
	const absolute = resolve(path);
	try {
		return realpathSync(absolute);
	} catch {
		const parent = dirname(absolute);
		if (parent === absolute) return absolute;
		try {
			return join(canonicalize(parent), basename(absolute));
		} catch {
			return absolute;
		}
	}
}

/** Whether `target` is `root` itself or lives underneath it. */
export function isInside(root: string, target: string): boolean {
	const from = normalizeForCompare(canonicalize(root));
	const to = normalizeForCompare(canonicalize(target));
	if (from === to) return true;
	const rel = relative(from, to);
	if (rel === "") return true;
	return !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * Expand a leading `~` the way Pi's own path resolution does.
 *
 * The file tools resolve paths with `expandTilde` on by default, so `read ~/.ssh/id_rsa` reaches the real
 * home directory. A guard that skipped this would treat `~` as an ordinary directory inside the workspace
 * and let the call through.
 */
export function expandHome(token: string): string | undefined {
	if (token === "~") return homedir();
	if (token.startsWith("~/") || token.startsWith("~\\")) return join(homedir(), token.slice(2));
	return undefined;
}

/** Where a value that looks like a path points, or undefined when it does not look like one. */
export interface PathCandidate {
	/** The token as written. */
	token: string;
	/** What it resolves to, when it resolves. */
	resolved?: string;
	/** Why it could not be resolved. */
	unresolved?: string;
}

/** A home-relative token cannot be resolved without expanding `~`, so it is reported as-is. */
const HOME_PREFIX = /^(?:~|\$HOME\b|\$\{HOME\}|%USERPROFILE%|%HOMEDRIVE%|%HOMEPATH%)/i;

/** Absolute forms: POSIX root, Windows drive, or UNC share. */
const ABSOLUTE_PATH = /^(?:[\\/]|[A-Za-z]:[\\/]|\\\\[^\\/])/;

/**
 * Extract the tokens of a shell command that look like filesystem paths.
 *
 * Deliberately conservative: flags and URLs are skipped rather than guessed at, because blocking a
 * legitimate command is worse than missing an exotic one, and the shell is not a boundary either way.
 */
export function findPathTokens(command: string): string[] {
	// Keep quoted runs together so `cat "../my file.txt"` is one token, then split the rest on shell
	// separators so `cat ../x;ls` still yields two tokens.
	const rawTokens = command.match(/"[^"]*"|'[^']*'|[^\s;|&()<>\r\n]+/g) ?? [];
	const tokens: string[] = [];
	for (const raw of rawTokens) {
		const token = raw.replace(/^["']|["']$/g, "");
		if (!token) continue;
		// Flags carry values that are not paths (`--depth=2`); skip the whole token.
		if (token.startsWith("-")) continue;
		// URLs contain `://` and their path part is not on this filesystem.
		if (token.includes("://")) continue;
		if (HOME_PREFIX.test(token) || ABSOLUTE_PATH.test(token) || token.split(/[\\/]/).includes("..")) {
			tokens.push(token);
		}
	}
	return tokens;
}

/** Resolve one token against the workspace, for reporting. */
export function describeToken(token: string, cwd: string): PathCandidate {
	if (HOME_PREFIX.test(token)) return { token, unresolved: "points outside the workspace (home directory)" };
	try {
		return { token, resolved: resolve(cwd, token) };
	} catch {
		return { token, unresolved: "is not a resolvable path" };
	}
}

/** Directory-ness is only known for paths that exist; an unknown path is treated as a file. */
export function isExistingDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}
