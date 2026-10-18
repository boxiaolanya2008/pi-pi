import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { upsertCustomProvider } from "../src/core/models-json-write.ts";

const testDir = join(process.cwd(), "test-models-json-write-tmp");
const modelsPath = join(testDir, "models.json");

function readModelsJson(): { $schema?: unknown; customField?: unknown; providers?: Record<string, unknown> } {
	return JSON.parse(readFileSync(modelsPath, "utf-8"));
}

beforeEach(() => {
	mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
	if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
});

describe("upsertCustomProvider", () => {
	it("writes a single model and keeps the provider name", () => {
		upsertCustomProvider(modelsPath, {
			providerId: "custom",
			baseUrl: "https://api.example.com/v1",
			api: "openai-completions",
			apiKey: "sk-test",
			modelId: "model-a",
		});
		const parsed = readModelsJson();
		expect(parsed.providers?.custom).toEqual({
			baseUrl: "https://api.example.com/v1",
			api: "openai-completions",
			apiKey: "sk-test",
			models: [{ id: "model-a" }],
		});
	});

	it("replaces the whole model list when modelIds is given", () => {
		upsertCustomProvider(modelsPath, {
			providerId: "custom",
			baseUrl: "https://one.example.com/v1",
			api: "openai-completions",
			modelId: "old-a",
		});
		upsertCustomProvider(modelsPath, {
			providerId: "custom",
			baseUrl: "https://two.example.com/v1",
			api: "openai-completions",
			modelId: "new-a",
			modelIds: ["new-a", "new-b"],
		});
		const parsed = readModelsJson();
		expect(parsed.providers?.custom).toEqual({
			baseUrl: "https://two.example.com/v1",
			api: "openai-completions",
			models: [{ id: "new-a" }, { id: "new-b" }],
		});
	});

	it("preserves unrelated providers and unknown top-level fields", () => {
		writeFileSync(
			modelsPath,
			JSON.stringify({
				$schema: "https://example.com/schema.json",
				customField: { keep: true },
				providers: {
					anthropic: { models: [{ id: "claude-sonnet" }] },
				},
			}),
		);
		upsertCustomProvider(modelsPath, {
			providerId: "custom",
			baseUrl: "https://api.example.com/v1",
			api: "openai-completions",
			modelId: "model-a",
		});
		const parsed = readModelsJson();
		expect(parsed.$schema).toBe("https://example.com/schema.json");
		expect(parsed.customField).toEqual({ keep: true });
		expect(parsed.providers?.anthropic).toEqual({ models: [{ id: "claude-sonnet" }] });
		expect((parsed.providers?.custom as Record<string, unknown>).models).toEqual([{ id: "model-a" }]);
	});
});
