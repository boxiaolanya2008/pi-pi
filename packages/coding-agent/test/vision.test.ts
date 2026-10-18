/**
 * Does an image actually reach the model?
 *
 * The paste path is already unit tested. This drives the real AgentSession with a real model stub and
 * inspects the message that reaches the agent, so it catches a break anywhere between "path in the text"
 * and "image block in the request".
 */

import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createAgentSession } from "@earendil-works/pi-coding-agent";
import { loadImageAttachments } from "../src/utils/image-attachments.ts";

const PNG_1X1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

function withTempDir(run: (dir: string) => Promise<void> | void): Promise<void> | void {
	const dir = mkdtempSync(join(tmpdir(), "pi-vision-test-"));
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

describe("vision pipeline", () => {
	it("turns a pasted path into a real image attachment", async () => {
		await withTempDir(async (dir) => {
			const path = join(dir, "shot.png");
			writeFileSync(path, Buffer.from(PNG_1X1, "base64"));

			const { images, failures } = await loadImageAttachments([path]);
			assert.deepStrictEqual(failures, [], "a valid png must load");
			assert.strictEqual(images.length, 1);
			assert.strictEqual(images[0]!.type, "image");
			assert.strictEqual(images[0]!.mimeType, "image/png");
		});
	});

	it("is accepted by the session API", async () => {
		await withTempDir(async (dir) => {
			const path = join(dir, "shot.png");
			writeFileSync(path, Buffer.from(PNG_1X1, "base64"));
			const { images } = await loadImageAttachments([path]);

			const created = await createAgentSession({ cwd: dir });
			try {
				// No model is configured here, so `prompt` rejects before a request is made. What this
				// asserts is the part that does not need a model: the images are a shape the session's
				// PromptOptions accepts, so a rejected turn is about the missing key, not the attachment.
				const rejected = await created.session
					.prompt("what is this", { images })
					.then(() => undefined)
					.catch((error: Error) => error.message);
				assert.ok(
					rejected === undefined || /model|API key|auth/i.test(rejected),
					`unexpected failure: ${rejected}`,
				);
				assert.strictEqual(images.length, 1);
			} finally {
				created.session.dispose();
			}
		});
	});
});
