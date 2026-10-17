/**
 * Guard against false positives in the shell-write check.
 *
 * These were the gap that let a bad pattern through: the behaviour tests only asserted that the right
 * commands were blocked, never that ordinary reading was allowed. A guard that refuses `cat README.md`
 * stops work, so every case here is a command that only reads.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { findShellWrite } from "../src/extensions/workspace-guard/index.ts";

describe("findShellWrite ignores ordinary reads", () => {
	const reads = [
		// `.md` used to match the cmd builtin `md`, which blocked reading any markdown file.
		"Get-Content packages/coding-agent/docs/rpc.md -TotalCount 40",
		"cat README.md",
		"cat docs/architecture.md",
		"rg --glob '*.md' pattern",
		"git log --oneline -5 -- README.md",
		// `=>` used to match the redirection pattern.
		'node -e "const f = (x) => x + 1; console.log(f(1))"',
		"node --test test/a.test.ts",
		// A redirection that is only mentioned inside a quoted argument writes nothing.
		'git commit -m "fix: a > b in the parser"',
		"echo 'a > b'",
		'rg "foo > bar" src',
		// Discarding output is not writing a file.
		"npm test > /dev/null",
		"npm test 2>&1",
		"npm test > nul",
		// A path that happens to contain a command name.
		"cat src/rm-operations.ts",
		"cat src/cp-utils.ts",
		"ls build/mv",
		// Runs code without touching the filesystem.
		"git status",
		"npm run check",
		"node scripts/verify.mjs",
	];

	for (const command of reads) {
		it(`allows ${JSON.stringify(command)}`, () => {
			assert.strictEqual(findShellWrite(command), undefined);
		});
	}
});

describe("findShellWrite still catches real writes", () => {
	const writes: { command: string; expected: string }[] = [
		{ command: "echo hi > out.txt", expected: "output redirection" },
		{ command: "cat a.txt >> b.txt", expected: "output redirection" },
		{ command: "cat > src/new.ts <<EOF", expected: "output redirection" },
		{ command: "printf x | tee out.txt", expected: "tee/truncate/dd" },
		{ command: "sed -i 's/a/b/' file.ts", expected: "in-place sed" },
		{ command: "rm -rf build", expected: "file mutation command" },
		{ command: "sudo rm -rf build", expected: "file mutation command" },
		{ command: "git add . && rm -rf build", expected: "file mutation command" },
		{ command: "mv a.ts b.ts", expected: "file mutation command" },
		{ command: "cp a.ts b.ts", expected: "file mutation command" },
		{ command: "mkdir -p src/new", expected: "file mutation command" },
		{ command: "touch new.ts", expected: "file mutation command" },
		{ command: "Set-Content out.txt 'hi'", expected: "PowerShell file command" },
		{ command: "Remove-Item out.txt", expected: "PowerShell file command" },
		{ command: "del out.txt", expected: "cmd file command" },
		{ command: "md newfolder", expected: "cmd file command" },
	];

	for (const { command, expected } of writes) {
		it(`blocks ${JSON.stringify(command)}`, () => {
			assert.strictEqual(findShellWrite(command), expected);
		});
	}

	it("does not see a command that is itself quoted, which is a known gap", () => {
		// Treating a quote as a command boundary would catch this, but it would also block a search for the
		// text, as in `rg "rm -rf"`. False positives stop ordinary work, and the guard is documented as a
		// guard rail rather than a sandbox, so the gap is stated instead of traded for noise.
		assert.strictEqual(findShellWrite('bash -c "rm -rf build"'), undefined);
	});

	it("catches a write after a pipeline", () => {
		assert.strictEqual(findShellWrite("cat a.txt | tee b.txt"), "tee/truncate/dd");
	});
});
