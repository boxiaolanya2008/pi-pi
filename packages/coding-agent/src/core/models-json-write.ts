/**
 * Minimal models.json writer for guided setup.
 * Preserves unknown fields via JSON round-trip; tolerates comments and BOM on read.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { stripJsonComments } from "../utils/json.ts";
import { stripBom } from "../utils/text.ts";
import type { ModelsJsonProvider } from "./model-config.ts";

/** models.json provider id used by the guided setup. */
export const CUSTOM_PROVIDER_ID = "custom";

export interface CustomModelConfig {
	providerId: string;
	baseUrl: string;
	api: string;
	apiKey?: string;
	modelId: string;
	/** When set, replaces the provider's model list entirely (e.g. a model list fetched from the endpoint). */
	modelIds?: string[];
	/** Display name shown in pickers. Unset keeps the previous value, if any. */
	name?: string;
}

/**
 * Create or update one provider entry and ensure `modelId` is in its model list.
 * An empty `apiKey` keeps any previously stored value.
 */
export function upsertCustomProvider(modelsPath: string, config: CustomModelConfig): void {
	let parsed: { $schema?: string; providers?: Record<string, ModelsJsonProvider> } = {};
	try {
		parsed = JSON.parse(stripJsonComments(stripBom(readFileSync(modelsPath, "utf-8"))));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}

	const providers = parsed.providers ?? {};
	const existing = providers[config.providerId];
	const models = config.modelIds?.length
		? config.modelIds.map((id) => ({ id }))
		: [...(existing?.models ?? []).filter((m) => m.id !== config.modelId), { id: config.modelId }];
	const provider: ModelsJsonProvider = {
		...existing,
		...(config.name ? { name: config.name } : {}),
		baseUrl: config.baseUrl,
		api: config.api,
		...(config.apiKey ? { apiKey: config.apiKey } : {}),
		models,
	};
	providers[config.providerId] = provider;
	parsed.providers = providers;

	mkdirSync(dirname(modelsPath), { recursive: true });
	writeFileSync(modelsPath, `${JSON.stringify(parsed, null, "\t")}\n`);
}
