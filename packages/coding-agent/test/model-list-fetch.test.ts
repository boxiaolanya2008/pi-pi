import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchModelList, modelListEndpoints, parseModelListResponse } from "../src/utils/model-list-fetch.ts";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("modelListEndpoints", () => {
	it("tries /models before /v1/models for OpenAI-style APIs", () => {
		expect(modelListEndpoints("https://api.example.com/v1", "openai-completions")).toEqual([
			"https://api.example.com/v1/models",
			"https://api.example.com/v1/v1/models",
		]);
	});

	it("strips a trailing slash from the base URL", () => {
		expect(modelListEndpoints("https://api.example.com/", "openai-completions")).toEqual([
			"https://api.example.com/models",
			"https://api.example.com/v1/models",
		]);
	});

	it("tries /v1/models first for Anthropic-style APIs", () => {
		expect(modelListEndpoints("https://api.anthropic.com", "anthropic-messages")).toEqual([
			"https://api.anthropic.com/v1/models",
			"https://api.anthropic.com/models",
		]);
	});
});

describe("parseModelListResponse", () => {
	it("parses the OpenAI shape", () => {
		expect(
			parseModelListResponse(
				JSON.stringify({
					object: "list",
					data: [{ id: "gpt-4o" }, { id: "o4-mini", object: "model" }],
				}),
			),
		).toEqual(["gpt-4o", "o4-mini"]);
	});

	it("parses the Anthropic shape", () => {
		expect(
			parseModelListResponse(
				JSON.stringify({
					data: [
						{ type: "model", id: "claude-sonnet-5" },
						{ type: "model", id: "claude-opus-5-5" },
					],
					has_more: false,
				}),
			),
		).toEqual(["claude-sonnet-5", "claude-opus-5-5"]);
	});

	it("parses a bare array and a models field", () => {
		expect(parseModelListResponse(JSON.stringify([{ id: "a" }, { id: "b" }]))).toEqual(["a", "b"]);
		expect(parseModelListResponse(JSON.stringify({ models: [{ id: "c" }] }))).toEqual(["c"]);
	});

	it("deduplicates and skips entries without an id", () => {
		expect(parseModelListResponse(JSON.stringify({ data: [{ id: "a" }, { id: "a" }, { object: "list" }] }))).toEqual([
			"a",
		]);
	});

	it("returns an empty list for unexpected payloads", () => {
		expect(parseModelListResponse("not json")).toEqual([]);
		expect(parseModelListResponse(JSON.stringify({ data: {} }))).toEqual([]);
	});
});

describe("fetchModelList", () => {
	function mockFetch(responses: Array<{ status: number; body?: unknown }>): void {
		let call = 0;
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				const response = responses[Math.min(call, responses.length - 1)];
				call += 1;
				return new Response(response?.body === undefined ? "" : JSON.stringify(response.body), {
					status: response?.status ?? 200,
				});
			}),
		);
	}

	it("fetches from the first endpoint that answers with models", async () => {
		mockFetch([
			{ status: 404 },
			{ status: 200, body: { data: [{ id: "deepseek-chat" }, { id: "deepseek-reasoner" }] } },
		]);
		const fetchMock = fetch as ReturnType<typeof vi.fn>;
		expect(await fetchModelList("https://api.deepseek.com/v1", "openai-completions", "sk-test")).toEqual([
			"deepseek-chat",
			"deepseek-reasoner",
		]);
		// The 404 on /models fell through to /v1/models.
		expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
			"https://api.deepseek.com/v1/models",
			"https://api.deepseek.com/v1/v1/models",
		]);
	});

	it("sends the API key as a bearer token", async () => {
		mockFetch([{ status: 200, body: { data: [{ id: "m1" }] } }]);
		await fetchModelList("https://api.example.com/v1", "openai-completions", "sk-test");
		const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as RequestInit;
		expect(new Headers(init.headers).get("authorization")).toBe("Bearer sk-test");
	});

	it("sends the API key as x-goog-api-key for Gemini-style endpoints", async () => {
		mockFetch([{ status: 200, body: { data: [{ id: "m1" }] } }]);
		await fetchModelList("https://generativelanguage.googleapis.com/v1beta", "google-generative-ai", "sk-test");
		const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as RequestInit;
		const headers = new Headers(init.headers);
		expect(headers.get("x-goog-api-key")).toBe("sk-test");
		expect(headers.get("authorization")).toBeNull();
	});

	it("throws the last failure when no endpoint lists models", async () => {
		mockFetch([{ status: 401 }, { status: 500 }]);
		await expect(fetchModelList("https://api.example.com/v1", "openai-completions", "sk-bad")).rejects.toThrow(
			"HTTP 500",
		);
	});

	it("returns an empty list when the endpoint answers without models", async () => {
		mockFetch([{ status: 200, body: { data: [] } }]);
		expect(await fetchModelList("https://api.example.com/v1", "openai-completions", "sk-test")).toEqual([]);
	});
});
