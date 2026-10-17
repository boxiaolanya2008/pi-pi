/**
 * Image mention extraction.
 *
 * Runs in temporary directories so a wrong assertion cannot attach a real file. The property that
 * matters most: prose that merely mentions a path must not be turned into an attachment.
 */

import assert from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { describe, it } from "node:test";
import { extractImagePaths, loadImageAttachments } from "../src/utils/image-attachments.ts";

/** Smallest valid 1x1 PNG, so the loader has something real to decode. */
const PNG_1X1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

function withTempDir<T>(run: (dir: string) => T | Promise<T>): Promise<T> | T {
	const dir = mkdtempSync(join(tmpdir(), "pi-attach-test-"));
	const finish = () => rmSync(dir, { recursive: true, force: true });
	try {
		const result = run(dir);
		if (result instanceof Promise) return result.finally(finish);
		finish();
		return result;
	} catch (error) {
		finish();
		throw error;
	}
}

function writePng(dir: string, name: string): string {
	const path = join(dir, name);
	writeFileSync(path, Buffer.from(PNG_1X1, "base64"));
	return path;
}

describe("extractImagePaths", () => {
	it("finds a bare pasted path, which is what the clipboard handler inserts", () => {
		withTempDir((dir) => {
			const image = writePng(dir, "shot.png");
			const result = extractImagePaths(`what is this ${image}`, dir);
			assert.deepStrictEqual(result.paths, [image]);
		});
	});

	it("finds an @-prefixed mention", () => {
		withTempDir((dir) => {
			const image = writePng(dir, "shot.png");
			const result = extractImagePaths(`look at @${image}`, dir);
			assert.deepStrictEqual(result.paths, [image]);
			assert.ok(!result.text.includes("@"), "the mention must be removed, including the prefix");
		});
	});

	it("resolves a relative path against the working directory", () => {
		withTempDir((dir) => {
			mkdirSync(join(dir, "img"), { recursive: true });
			writePng(join(dir, "img"), "a.png");
			const result = extractImagePaths(`check img/a.png`, dir);
			assert.deepStrictEqual(result.paths, [join(dir, "img", "a.png")]);
		});
	});

	it("keeps a quoted path with spaces together", () => {
		withTempDir((dir) => {
			const image = writePng(dir, "my shot.png");
			const result = extractImagePaths(`look at "${image}"`, dir);
			assert.deepStrictEqual(result.paths, [image]);
		});
	});

	it("ignores a path that only looks like an image", () => {
		withTempDir((dir) => {
			const result = extractImagePaths("see shot.png for details", dir);
			assert.deepStrictEqual(result.paths, [], "a nonexistent file must not be attached");
			assert.strictEqual(result.text, "see shot.png for details", "text must be left alone");
		});
	});

	it("ignores non-image files even when they exist", () => {
		withTempDir((dir) => {
			writeFileSync(join(dir, "config.json"), "{}");
			const result = extractImagePaths("read config.json", dir);
			assert.deepStrictEqual(result.paths, []);
			assert.strictEqual(result.text, "read config.json");
		});
	});

	it("ignores a directory named like an image", () => {
		withTempDir((dir) => {
			mkdirSync(join(dir, "assets.png"), { recursive: true });
			const result = extractImagePaths("list assets.png", dir);
			assert.deepStrictEqual(result.paths, [], "only regular files are attached");
		});
	});

	it("deduplicates a repeated path", () => {
		withTempDir((dir) => {
			const image = writePng(dir, "shot.png");
			const result = extractImagePaths(`${image} and again ${image}`, dir);
			assert.deepStrictEqual(result.paths, [image]);
			assert.ok(!result.text.includes(image), "both mentions must be removed");
		});
	});

	it("reports paths in the order they appear", () => {
		withTempDir((dir) => {
			const first = writePng(dir, "one.png");
			const second = writePng(dir, "two.png");
			const result = extractImagePaths(`a ${second} b ${first}`, dir);
			assert.deepStrictEqual(result.paths, [second, first]);
		});
	});

	it("leaves the message readable after removing a mention", () => {
		withTempDir((dir) => {
			const image = writePng(dir, "shot.png");
			const result = extractImagePaths(`what is this ${image} anyway`, dir);
			assert.strictEqual(result.text, "what is this anyway");
		});
	});

	it("returns the text unchanged when nothing matches", () => {
		withTempDir((dir) => {
			const text = "plain message with no images";
			const result = extractImagePaths(text, dir);
			assert.deepStrictEqual(result.paths, []);
			assert.strictEqual(result.text, text);
		});
	});

	it("accepts Windows separators and mixed case extensions", () => {
		withTempDir((dir) => {
			const image = writePng(dir, "SHOT.PNG");
			const result = extractImagePaths(`look ${image.replace(/\//g, sep)}`, dir);
			assert.deepStrictEqual(result.paths, [image]);
		});
	});
});

describe("loadImageAttachments", () => {
	it("loads a real png into an image block", async () => {
		await withTempDir(async (dir) => {
			const image = writePng(dir, "shot.png");
			const { images, failures } = await loadImageAttachments([image]);
			assert.deepStrictEqual(failures, []);
			assert.strictEqual(images.length, 1);
			assert.strictEqual(images[0]!.type, "image");
			assert.ok(images[0]!.data.length > 0);
			assert.match(images[0]!.mimeType, /^image\//);
		});
	});

	it("reports a file whose contents are not an image instead of dropping it silently", async () => {
		await withTempDir(async (dir) => {
			const fake = join(dir, "fake.png");
			writeFileSync(fake, "this is not a png");
			const { images, failures } = await loadImageAttachments([fake]);
			assert.deepStrictEqual(images, []);
			assert.strictEqual(failures.length, 1);
			assert.strictEqual(failures[0]!.path, fake);
		});
	});
});
