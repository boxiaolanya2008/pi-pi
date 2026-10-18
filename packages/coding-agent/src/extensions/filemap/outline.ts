/**
 * Declaration outline extraction for the filemap tool.
 *
 * Why: a declaration-only skeleton lets the model locate regions before spending
 * a full read. Extraction is regex-based and deterministic (no IO, no model call),
 * so identical file content always yields an identical outline — safe to replay.
 */

/** Maximum outline rows; keeps the tool result small and bounded. */
const MAX_ROWS = 150;

/** Longest line shown in the outline; bodies beyond this are cut. */
const MAX_LINE = 120;

const PATTERNS: RegExp[] = [
	// JS/TS top-level declarations and class members.
	/^\s*(export\s+)?(default\s+)?(async\s+)?(function|class|interface|enum|type|const|let)\s+[\w$<]/,
	/^\s{1,}(public|private|protected|static|abstract|override)\s+[\w$<[(]/,
	/^\s{1,}(get|set|async)\s+[\w$]/,
	// Python.
	/^\s*(async\s+)?(def|class)\s+\w+/,
	// Rust.
	/^\s*(pub(\([^)]*\))?\s+)?(fn|struct|enum|trait|impl|mod)\s+\w+/,
	// Go.
	/^\s*(func|type)\s+[\w[(]*\w*\s*(\w|\()/,
	// Java/C#/C++.
	/^\s*(public|private|protected|static|final|abstract|class|interface|struct|template)\s+[\w<]/,
	/^\s*#\s*(define|include)\s+\w+/,
];

/**
 * Extract declaration lines with line numbers from file content.
 * Returns `行号: 内容` rows, capped at {@link MAX_ROWS}.
 */
export function outlineFile(content: string): { rows: string[]; declarations: number; totalLines: number } {
	const lines = content.split("\n");
	const rows: string[] = [];
	let declarations = 0;
	for (let i = 0; i < lines.length; i++) {
		if (rows.length >= MAX_ROWS) break;
		const line = lines[i];
		if (!line.trim()) continue;
		if (!PATTERNS.some((pattern) => pattern.test(line))) continue;
		declarations++;
		const trimmed = line.trim();
		const shown = trimmed.length > MAX_LINE ? `${trimmed.slice(0, MAX_LINE)}…` : trimmed;
		rows.push(`${i + 1}: ${shown}`);
	}
	return { rows, declarations, totalLines: lines.length };
}
