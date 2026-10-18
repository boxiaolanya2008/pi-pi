/**
 * Model list discovery for user-configured endpoints.
 *
 * OpenAI-compatible endpoints serve `GET {baseUrl}/models`; Anthropic-compatible
 * endpoints serve `GET {baseUrl}/v1/models`. Both answer `{ "data": [{ "id": ... }] }`.
 */

import { fetchWithRetry } from "./management-http.ts";

/** Candidate endpoints for the model list, tried in order. */
export function modelListEndpoints(baseUrl: string, api: string): string[] {
	const base = baseUrl.replace(/\/+$/, "");
	const paths = api === "anthropic-messages" ? ["v1/models", "models"] : ["models", "v1/models"];
	return paths.map((path) => `${base}/${path}`);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function asModelId(entry: unknown): string | undefined {
	if (typeof entry === "string") {
		return entry.trim() || undefined;
	}
	const record = asRecord(entry);
	for (const field of ["id", "name"]) {
		const value = record?.[field];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return undefined;
}

/**
 * Extract model ids from a model list payload. Accepts a bare array,
 * `{ "data": [...] }` (OpenAI and Anthropic shapes), or `{ "models": [...] }`.
 */
export function parseModelListResponse(text: string): string[] {
	let payload: unknown;
	try {
		payload = JSON.parse(text);
	} catch {
		return [];
	}
	const root = asRecord(payload);
	const entries = Array.isArray(payload)
		? payload
		: Array.isArray(root?.data)
			? root.data
			: Array.isArray(root?.models)
				? root.models
				: undefined;
	if (!entries) return [];
	const ids: string[] = [];
	for (const entry of entries) {
		const id = asModelId(entry);
		if (id && !ids.includes(id)) ids.push(id);
	}
	return ids;
}

export interface ModelListFetchOptions {
	signal?: AbortSignal;
	/** Overall time budget shared by all candidate requests. Defaults to 15 seconds. */
	timeoutMs?: number;
}

/**
 * Fetch the model list from a user-configured endpoint, trying each candidate
 * URL until one answers with ids. Throws the last failure when none do.
 */
export async function fetchModelList(
	baseUrl: string,
	api: string,
	apiKey: string,
	options: ModelListFetchOptions = {},
): Promise<string[]> {
	const signal = options.signal ?? AbortSignal.timeout(options.timeoutMs ?? 15_000);
	const headers: Record<string, string> = { accept: "application/json" };
	if (apiKey) {
		// Gemini endpoints authenticate with x-goog-api-key, not a bearer token.
		if (api === "google-generative-ai") headers["x-goog-api-key"] = apiKey;
		else headers.authorization = `Bearer ${apiKey}`;
	}

	let lastFailure: Error | undefined;
	for (const endpoint of modelListEndpoints(baseUrl, api)) {
		try {
			const response = await fetchWithRetry(
				endpoint,
				{ method: "GET", headers, signal },
				{ maxRetries: 1, timeoutMs: options.timeoutMs ?? 15_000 },
			);
			// An endpoint that does not offer a model list is not an error; try the next candidate.
			if (response.status === 404 || response.status === 405 || response.status === 501) continue;
			if (!response.ok) {
				lastFailure = new Error(`HTTP ${response.status}`);
				continue;
			}
			const ids = parseModelListResponse(await response.text());
			if (ids.length > 0) return ids;
		} catch (error) {
			if (signal.aborted) throw error;
			lastFailure = error instanceof Error ? error : new Error(String(error));
		}
	}
	if (lastFailure) throw lastFailure;
	return [];
}
