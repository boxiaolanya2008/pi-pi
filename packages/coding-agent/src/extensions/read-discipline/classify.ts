/**
 * Command classification for the read-discipline extension.
 *
 * Why: models imitate "reading" a file with shell commands (cat/head/grep), then
 * edit from partial content. These pure functions decide which bash results deserve
 * a "use read" hint. Kept pure and deterministic so the appended hint text never
 * varies between replays (prompt-cache safe).
 */

/** Commands whose output mimics reading file content rather than inspecting state. */
const CONTENT_IMITATORS = /^(cat|head|tail|less|more|bat)\b/;

/** Search commands: output is matching lines, never whole files. */
const SEARCHERS = /\b(grep|rg|ack|ag|git\s+grep|git\s+log\s+-S)\b/;

/** sed -n / awk print ranges imitate partial reads. */
const LINE_PRINTERS = /\b(sed\s+-n|sed\s+['"][0-9$.,]*[pP]|awk)/;

/**
 * Whether a bash command imitates reading file content instead of using `read`.
 * Only the first pipeline/chain segment is classified for imitators; searchers
 * are matched anywhere because `git log | grep` still searches.
 */
export function isContentImitatingCommand(command: string): boolean {
	const first = command.trim().split(/\s*[|;&]\s*/)[0] ?? "";
	return CONTENT_IMITATORS.test(first) || SEARCHERS.test(command) || LINE_PRINTERS.test(command);
}

/**
 * Extract file paths from grep-style `path:line: text` output, deduplicated,
 * capped to keep the hint short.
 */
export function filesFromGrepOutput(text: string, cap = 8): string[] {
	const files = new Set<string>();
	for (const line of text.split("\n")) {
		const match = /^(\S[^:\n]*):\d+[:\s-]/.exec(line);
		if (match?.[1]) files.add(match[1]);
		if (files.size >= cap) break;
	}
	return [...files];
}
