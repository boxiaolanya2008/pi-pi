/**
 * Filemap extension.
 *
 * Why: models often grep for file names and never open the file, then edit from
 * fragments. `filemap` gives a cheap declaration skeleton (line numbers only, no
 * bodies) so the model can locate regions and follow up with a targeted
 * `read(path, offset, limit)` instead of guessing. Deterministic: same file
 * content yields the same outline, so replays stay byte-identical.
 *
 * Configuration: `PI_FILEMAP=off` disables the tool.
 */

import { readFile, stat } from "fs/promises";
import { resolve } from "path";
import { Type } from "typebox";
import type { ExtensionAPI } from "../../core/extensions/types.ts";
import { outlineFile } from "./outline.ts";

/** Refuse files larger than this; the model should read such files in ranges. */
const MAX_FILE_BYTES = 1024 * 1024;

function toolEnabled(): boolean {
	const value = process.env.PI_FILEMAP?.trim().toLowerCase();
	return !(value === "off" || value === "0" || value === "false" || value === "no");
}

export default function filemapExtension(pi: ExtensionAPI): void {
	if (!toolEnabled()) return;

	pi.registerTool({
		name: "filemap",
		label: "Filemap",
		description:
			"Show a file's declaration skeleton: line numbers of functions/classes/structs/etc, without bodies. Use before read to locate the region you need, then read(path, offset, limit) that range.",
		parameters: Type.Object({
			path: Type.String({ description: "Path to the file (relative or absolute)" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const cwd = ctx?.cwd || process.cwd();
			const absolute = resolve(cwd, params.path);
			let content: string;
			try {
				const info = await stat(absolute);
				if (info.size > MAX_FILE_BYTES) {
					return {
						details: {},
						content: [
							{
								type: "text" as const,
								text: `File too large for filemap (${info.size} bytes). Use read(path, offset, limit) to read it in ranges.`,
							},
						],
						isError: true,
					};
				}
				content = await readFile(absolute, "utf-8");
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					details: {},
					content: [{ type: "text" as const, text: `Cannot read ${params.path}: ${message}` }],
					isError: true,
				};
			}

			const { rows, declarations, totalLines } = outlineFile(content);
			const header = `${totalLines} lines, ${declarations} declarations`;
			if (rows.length === 0) {
				return {
					details: {},
					content: [
						{
							type: "text" as const,
							text: `${header}\n(no declarations matched; use read to inspect the file)`,
						},
					],
				};
			}
			const footer = `Use read(path, offset, limit) to read the ranges you need (e.g. offset=${rows[0]?.split(":")[0] ?? "1"}).`;
			return {
				details: {},
				content: [{ type: "text" as const, text: `${header}\n${rows.join("\n")}\n${footer}` }],
			};
		},
	});
}
