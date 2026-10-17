/**
 * Workspace guard: path containment and shell token scanning.
 *
 * Everything here runs in temporary directories, so a wrong assertion cannot touch a real project.
 * The guard is a discipline boundary, not a sandbox; these tests pin the behavior it does promise.
 */

import assert from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { describe, it } from "node:test";
import { describeToken, findPathTokens, isInside } from "../src/extensions/workspace-guard/paths.ts";

function withTempDir<T>(run: (dir: string) => T): T {
	const dir = mkdtempSync(join(tmpdir(), "pi-guard-test-"));
	try {
		return run(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

describe("isInside", () => {
	it("accepts the root itself", () => {
		withTempDir((dir) => {
			assert.strictEqual(isInside(dir, dir), true);
		});
	});

	it("accepts a nested file", () => {
		withTempDir((dir) => {
			const nested = join(dir, "src", "a.ts");
			mkdirSync(join(dir, "src"), { recursive: true });
			writeFileSync(nested, "x");
			assert.strictEqual(isInside(dir, nested), true);
		});
	});

	it("accepts a nested path that does not exist yet", () => {
		withTempDir((dir) => {
			assert.strictEqual(isInside(dir, join(dir, "new", "deep", "file.ts")), true);
		});
	});

	it("rejects a sibling directory", () => {
		withTempDir((dir) => {
			const sibling = join(dir, "..", "other-project");
			assert.strictEqual(isInside(dir, sibling), false);
		});
	});

	it("rejects a prefix that merely shares the name", () => {
		withTempDir((dir) => {
			// A naive startsWith() would accept this: /tmp/x/proj-extra starts with /tmp/x/proj.
			assert.strictEqual(isInside(dir, `${dir}-extra`), false);
		});
	});

	it("rejects an absolute path outside the workspace", () => {
		withTempDir((dir) => {
			const outside = process.platform === "win32" ? "C:\\Windows\\System32" : "/etc";
			assert.strictEqual(isInside(dir, outside), false);
		});
	});

	it("follows a symlink that escapes the workspace", () => {
		withTempDir((dir) => {
			const workspace = join(dir, "project");
			const outside = join(dir, "outside");
			mkdirSync(workspace, { recursive: true });
			mkdirSync(outside, { recursive: true });
			writeFileSync(join(outside, "secret.txt"), "secret");
			try {
				symlinkSync(outside, join(workspace, "escape"), "junction");
			} catch {
				// Junctions need no privilege on Windows, but symlinks may be denied elsewhere; skip.
				return;
			}
			// The path looks like it is inside, but it resolves outside.
			assert.strictEqual(isInside(workspace, join(workspace, "escape", "secret.txt")), false);
		});
	});

	it("rejects a path that walks up with ..", () => {
		withTempDir((dir) => {
			const workspace = join(dir, "project");
			mkdirSync(workspace, { recursive: true });
			assert.strictEqual(isInside(workspace, join(workspace, "..", "other", "a.ts")), false);
		});
	});
});

describe("findPathTokens", () => {
	it("finds absolute, parent-relative, and home tokens", () => {
		const tokens = findPathTokens("cat /etc/passwd ../other/a.ts ~/.ssh/id_rsa");
		assert.deepStrictEqual(tokens, ["/etc/passwd", "../other/a.ts", "~/.ssh/id_rsa"]);
	});

	it("ignores plain relative names", () => {
		assert.deepStrictEqual(findPathTokens("node src/index.ts && npm test"), []);
	});

	it("ignores flags, including flags carrying a value", () => {
		assert.deepStrictEqual(findPathTokens("rg --depth=2 --glob=*.ts pattern"), []);
	});

	it("ignores URLs", () => {
		assert.deepStrictEqual(findPathTokens("curl https://example.com/a/b.json"), []);
	});

	it("splits on shell separators so a chained command is still scanned", () => {
		const tokens = findPathTokens("ls;cat ../x.txt|wc -l&&cat /etc/hosts");
		assert.ok(tokens.includes("../x.txt"), `expected ../x.txt in ${JSON.stringify(tokens)}`);
		assert.ok(tokens.includes("/etc/hosts"), `expected /etc/hosts in ${JSON.stringify(tokens)}`);
	});

	it("strips quotes around a path", () => {
		const tokens = findPathTokens('cat "../outside file.txt"');
		assert.deepStrictEqual(tokens, ["../outside file.txt"]);
	});

	it("finds Windows drive paths", () => {
		const tokens = findPathTokens("type C:\\Windows\\win.ini");
		assert.deepStrictEqual(tokens, ["C:\\Windows\\win.ini"]);
	});
});

describe("describeToken", () => {
	it("resolves a relative token against the workspace", () => {
		withTempDir((dir) => {
			const candidate = describeToken(`..${sep}other${sep}a.ts`, dir);
			assert.ok(candidate.resolved, "expected a resolved path");
			assert.strictEqual(isInside(dir, candidate.resolved!), false);
		});
	});

	it("reports home-relative tokens as unresolved rather than guessing", () => {
		const candidate = describeToken("~/.ssh/id_rsa", "/tmp/workspace");
		assert.strictEqual(candidate.resolved, undefined);
		assert.match(candidate.unresolved ?? "", /home directory/);
	});
});
