/**
 * Shell resolution and default tool selection.
 *
 * The point of the Windows fallback is that the model stops burning retries on POSIX commands sent to a
 * machine with no bash, so these tests assert the resolved dialect as much as the resolved shell.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { DEFAULT_TOOL_NAMES } from "../src/core/settings-manager.ts";
import { createBashToolDefinition } from "../src/core/tools/bash.ts";
import { createGrepToolDefinition } from "../src/core/tools/grep.ts";
import { getShellConfig, type ShellConfig } from "../src/utils/shell.ts";

const IS_WINDOWS = process.platform === "win32";

describe("getShellConfig", () => {
	it("always resolves to a shell and always reports a dialect", () => {
		const config = getShellConfig();
		assert.ok(config.shell.length > 0, "expected a shell path");
		assert.ok(config.dialect === "posix" || config.dialect === "powershell", `unexpected dialect: ${config.dialect}`);
	});

	it("accepts an argv transport for every resolved shell", () => {
		// `stdin` is reserved for the legacy WSL bash; every other shell takes `-c`.
		const config = getShellConfig();
		if (config.commandTransport === "stdin") {
			assert.strictEqual(IS_WINDOWS, true, "only the Windows WSL path uses stdin transport");
		} else {
			assert.ok(config.args.length > 0, "expected shell arguments");
		}
	});

	it("rejects a shellPath that does not exist", () => {
		assert.throws(() => getShellConfig("Z:\\definitely\\not\\a\\shell.exe"), /Custom shell path not found/);
	});

	it("resolves a real shellPath when one is given", { skip: !IS_WINDOWS }, () => {
		const config = getShellConfig(process.execPath);
		// Node is not a shell, but the point is that an existing path is accepted rather than rejected.
		assert.strictEqual(config.shell, process.execPath);
		assert.strictEqual(config.dialect, "posix", "an explicit bash-class path reports posix");
	});

	it("never resolves to a powershell dialect on a POSIX platform", { skip: IS_WINDOWS }, () => {
		assert.notStrictEqual(getShellConfig().dialect, "powershell");
	});
});

describe("Default tool set", () => {
	it("includes grep", () => {
		assert.ok(DEFAULT_TOOL_NAMES.includes("grep"), "grep must be enabled by default");
	});

	it("keeps the four coding tools it had before", () => {
		for (const name of ["read", "bash", "edit", "write"]) {
			assert.ok(DEFAULT_TOOL_NAMES.includes(name), `${name} must stay in the default set`);
		}
	});

	it("lists no duplicates", () => {
		assert.strictEqual(new Set(DEFAULT_TOOL_NAMES).size, DEFAULT_TOOL_NAMES.length);
	});

	it("exposes grep as a usable tool definition", () => {
		const grep = createGrepToolDefinition(process.cwd());
		assert.strictEqual(grep.name, "grep");
		assert.ok(grep.parameters.properties.pattern, "grep must take a pattern");
		for (const property of ["path", "glob", "ignoreCase", "literal", "context", "limit"]) {
			assert.ok(
				grep.parameters.properties[property as keyof typeof grep.parameters.properties],
				`grep must expose ${property}`,
			);
		}
	});
});

describe("Bash tool dialect guidance", () => {
	const definition = createBashToolDefinition(process.cwd());

	it("names bash in its description", () => {
		assert.match(definition.description, /bash/i);
	});

	it("adds PowerShell guidance only when the resolved shell is PowerShell", () => {
		const dialect = getShellConfig().dialect;
		const snippet = definition.promptSnippet ?? "";
		if (dialect === "powershell") {
			assert.match(snippet, /PowerShell/, "expected PowerShell guidance on a PowerShell host");
			assert.match(snippet, /Get-ChildItem/, "expected concrete PowerShell equivalents");
		} else {
			assert.doesNotMatch(snippet, /PowerShell syntax/, "POSIX hosts must not be told to write PowerShell");
		}
	});

	it("does not probe the shell when the caller supplies its own operations", () => {
		// A custom executor (SSH, sandbox) owns its shell, so no dialect guidance may be inferred.
		const custom = createBashToolDefinition(process.cwd(), {
			operations: { exec: async () => ({ exitCode: 0 }) },
		});
		assert.doesNotMatch(custom.promptSnippet ?? "", /PowerShell syntax/);
	});

	it("stays a valid shell config through the tool boundary", () => {
		const config: ShellConfig = getShellConfig();
		assert.ok(Array.isArray(config.args));
	});
});
