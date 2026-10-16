import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { appendUserDescription, readOrCreateReverie, snapshotForPrompt } from "../src/extensions/reverie/index.ts";

const dir = join(tmpdir(), `reverie-test-${process.pid}`);

afterAll(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("reverie memory file", () => {
	test("creates directory and file with header on first use", () => {
		const path = join(dir, "nested", "reverie.md");
		expect(existsSync(path)).toBe(false);
		const content = readOrCreateReverie(path);
		expect(existsSync(path)).toBe(true);
		expect(content).toContain("# Reverie");
	});

	test("appends dated descriptions without overwriting history", () => {
		const path = join(dir, "reverie.md");
		mkdirSync(dir, { recursive: true });
		appendUserDescription("喜欢简洁中文回复", path, new Date("2026-10-13T10:00:00Z"));
		appendUserDescription("  ", path);
		appendUserDescription("关注缓存命中率", path, new Date("2026-10-13T11:00:00Z"));
		const content = readFileSync(path, "utf-8");
		expect(content).toContain("# Reverie");
		expect(content).toContain("- [2026-10-13 10:00] 喜欢简洁中文回复");
		expect(content).toContain("- [2026-10-13 11:00] 关注缓存命中率");
		// Whitespace-only descriptions are dropped.
		expect(content.match(/喜欢简洁中文回复/g)).toHaveLength(1);
	});

	test("snapshot injection caps to the file tail", () => {
		expect(snapshotForPrompt("abc")).toBe("abc");
		const long = `${"x".repeat(5000)}tail-marker`;
		expect(snapshotForPrompt(long)).toBe(long.slice(-4000));
	});
});
