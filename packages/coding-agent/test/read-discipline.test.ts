/**
 * Read discipline classification.
 *
 * The property that matters: commands that imitate reading file content are
 * detected, ordinary shell commands are not, and grep output file extraction is
 * deterministic and capped.
 */

import { describe, expect, it } from "vitest";
import { filesFromGrepOutput, isContentImitatingCommand } from "../src/extensions/read-discipline/classify.ts";

describe("isContentImitatingCommand", () => {
	it("detects file content imitators", () => {
		expect(isContentImitatingCommand("cat src/index.ts")).toBe(true);
		expect(isContentImitatingCommand("head -50 src/index.ts")).toBe(true);
		expect(isContentImitatingCommand("tail -n 20 file.log")).toBe(true);
		expect(isContentImitatingCommand("sed -n '1,80p' src/index.ts")).toBe(true);
	});

	it("detects search commands anywhere in the line", () => {
		expect(isContentImitatingCommand("grep -rn TODO src/")).toBe(true);
		expect(isContentImitatingCommand("rg 'function' packages/")).toBe(true);
		expect(isContentImitatingCommand("git log -S fix")).toBe(true);
		expect(isContentImitatingCommand("git status && grep foo bar.ts")).toBe(true);
	});

	it("does not flag ordinary shell commands", () => {
		expect(isContentImitatingCommand("npm run check")).toBe(false);
		expect(isContentImitatingCommand("git status")).toBe(false);
		expect(isContentImitatingCommand("ls -la")).toBe(false);
		expect(isContentImitatingCommand("node build.mjs")).toBe(false);
	});
});

describe("filesFromGrepOutput", () => {
	it("extracts and deduplicates paths from grep-style lines", () => {
		const output = ["src/a.ts:12: const x = 1", "src/b.ts:3: let y = 2", "src/a.ts:40: const z = 3"].join("\n");
		expect(filesFromGrepOutput(output)).toEqual(["src/a.ts", "src/b.ts"]);
	});

	it("caps the file list", () => {
		const output = Array.from({ length: 20 }, (_, i) => `f${i}.ts:1: x`).join("\n");
		expect(filesFromGrepOutput(output)).toHaveLength(8);
	});

	it("returns empty for non-matching text", () => {
		expect(filesFromGrepOutput("No matches found")).toEqual([]);
	});
});
