/**
 * Filemap outline extraction.
 *
 * The property that matters: declaration lines are extracted with line numbers
 * for the supported languages, and the output is capped and deterministic.
 */

import { describe, expect, it } from "vitest";
import { outlineFile } from "../src/extensions/filemap/outline.ts";

describe("outlineFile", () => {
	it("extracts TS declarations with line numbers", () => {
		const content = [
			'import { x } from "./x.ts";',
			"",
			"export interface Foo {",
			"	a: string;",
			"}",
			"",
			"export function bar(): void {",
			"	console.log('body');",
			"}",
			"",
			"class Baz {",
			"	private value = 1;",
			"	run() {}",
			"}",
		].join("\n");
		const { rows, totalLines } = outlineFile(content);
		expect(totalLines).toBe(14);
		expect(rows).toContain("3: export interface Foo {");
		expect(rows).toContain("7: export function bar(): void {");
		expect(rows).toContain("11: class Baz {");
		expect(rows).toContain("12: private value = 1;");
		// Import lines are not declarations.
		expect(rows.some((row) => row.includes("import"))).toBe(false);
	});

	it("extracts python and rust declarations", () => {
		const py = ["def foo():", "    pass", "class Bar:", "    pass"].join("\n");
		expect(outlineFile(py).rows).toEqual(["1: def foo():", "3: class Bar:"]);

		const rs = ["pub struct S {", "}", "fn main() {}", "impl S {}"].join("\n");
		expect(outlineFile(rs).rows).toEqual(["1: pub struct S {", "3: fn main() {}", "4: impl S {}"]);
	});

	it("caps outline rows and truncates long lines", () => {
		const longLine = `export function wide(${Array.from({ length: 200 }, (_, i) => `arg${i}: number`).join(", ")}): void {}`;
		const many = Array.from({ length: 200 }, (_, i) => `export function f${i}(): void {}`).join("\n");
		const capped = outlineFile(many);
		expect(capped.rows.length).toBe(150);

		const single = outlineFile(longLine);
		expect(single.rows[0]?.length).toBeLessThanOrEqual(120 + 10);
		expect(single.rows[0]).toContain("…");
	});
});
