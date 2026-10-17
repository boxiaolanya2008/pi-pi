/**
 * Recognize image paths in text the user submitted, so they become real attachments.
 *
 * Nothing in interactive mode converted a pasted image into an attachment: the clipboard handler
 * writes the image to a temp file and inserts the bare path, and only the CLI startup path (`@file`
 * arguments) ran `processFileArguments`. A pasted screenshot therefore reached the model as a line of
 * text rather than an image, and the model had to spend a `read` round trip to see it.
 *
 * This only recognizes extensions the image pipeline supports, and only when the file exists, so a
 * path discussed in prose (`config/prod.json`) is never swallowed. Text is left untouched apart from
 * the removed mentions.
 */

import { statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, resolve } from "node:path";
import type { ImageContent } from "@earendil-works/pi-ai";
import { processImage } from "./image-process.ts";
import { detectSupportedImageMimeTypeFromFile } from "./mime.ts";

/** Extensions `processImage` accepts, plus the ones the clipboard path can produce. */
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]);

export interface ExtractedImages {
	/** The text with every recognized image mention removed. */
	text: string;
	/** Absolute paths of the recognized images, in the order they appeared, without duplicates. */
	paths: string[];
}

/**
 * A path token: either an `@`-prefixed mention, or a quoted string, or a bare run without whitespace.
 * Quotes are included so a path with spaces stays one token.
 */
const TOKEN = /(?:"([^"\r\n]+)"|'([^'\r\n]+)'|@?([^\s"'`]+))/g;

/** Whether `candidate` looks like an image this build can attach. */
function isImagePath(candidate: string): boolean {
	return IMAGE_EXTENSIONS.has(extname(candidate).toLowerCase());
}

/** Expand a leading `~` the way Pi's own path resolution does. */
function expandHome(token: string): string {
	const home = process.env.USERPROFILE ?? process.env.HOME;
	if (!home) return token;
	if (token === "~") return home;
	if (token.startsWith("~/") || token.startsWith("~\\")) return resolve(home, token.slice(2));
	return token;
}

/** Existing regular file, so a directory named `shot.png` or a typo is not attached. */
function isExistingFile(path: string): boolean {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

/**
 * Load resolved paths into attachments, resizing each to the inline provider limit.
 *
 * A file that turns out not to be a supported image, or one that cannot be resized under the limit,
 * keeps its mention in the message as a note rather than disappearing silently: losing the user's
 * image without saying so is worse than sending a line of text.
 */
export async function loadImageAttachments(
	paths: readonly string[],
	options?: { autoResizeImages?: boolean },
): Promise<{ images: ImageContent[]; failures: { path: string; message: string }[] }> {
	const images: ImageContent[] = [];
	const failures: { path: string; message: string }[] = [];

	for (const path of paths) {
		try {
			const mimeType = await detectSupportedImageMimeTypeFromFile(path);
			if (!mimeType) {
				failures.push({ path, message: "not a supported image format" });
				continue;
			}
			const bytes = await readFile(path);
			const processed = await processImage(bytes, mimeType, { autoResizeImages: options?.autoResizeImages });
			if (processed.ok) {
				images.push({ type: "image", data: processed.data, mimeType: processed.mimeType });
				continue;
			}

			// Resizing runs on Photon, a WASM module loaded on demand. When it is unavailable the resize
			// fails even for a tiny image, so fall back to the original bytes instead of dropping the
			// user's picture. The provider decides whether it fits.
			const unprocessed = await processImage(bytes, mimeType, { autoResizeImages: false });
			if (unprocessed.ok) {
				images.push({ type: "image", data: unprocessed.data, mimeType: unprocessed.mimeType });
				continue;
			}
			failures.push({ path, message: processed.message });
		} catch (error) {
			failures.push({ path, message: error instanceof Error ? error.message : String(error) });
		}
	}

	return { images, failures };
}

/**
 * Find the image mentions in `text` and resolve them against `cwd`.
 *
 * A mention is removed from the returned text only when it resolves to an existing file, so a
 * mistyped path stays visible in the message instead of vanishing.
 */
export function extractImagePaths(text: string, cwd: string): ExtractedImages {
	const paths: string[] = [];
	const removals: { start: number; end: number }[] = [];

	for (const match of text.matchAll(TOKEN)) {
		const raw = match[1] ?? match[2] ?? match[3];
		if (!raw) continue;
		if (!isImagePath(raw)) continue;

		const candidate = match[1] === undefined && match[2] === undefined ? raw.replace(/^@/, "") : raw;
		const absolute = isAbsolute(candidate) ? candidate : resolve(cwd, expandHome(candidate));
		if (!isExistingFile(absolute)) continue;

		if (!paths.includes(absolute)) paths.push(absolute);
		removals.push({ start: match.index!, end: match.index! + match[0].length });
	}

	if (paths.length === 0) return { text, paths };

	// Drop the mentions, then tidy the whitespace they leave behind so the message does not start with
	// blank lines or keep double spaces where a path used to be.
	let cleaned = text;
	for (let index = removals.length - 1; index >= 0; index--) {
		const { start, end } = removals[index]!;
		cleaned = cleaned.slice(0, start) + cleaned.slice(end);
	}
	cleaned = cleaned
		.split("\n")
		.map((line) => line.replace(/[ \t]{2,}/g, " ").trimEnd())
		.join("\n")
		.trim();

	return { text: cleaned, paths };
}
