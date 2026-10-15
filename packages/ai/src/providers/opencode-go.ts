import { anthropicMessagesApi } from "../api/anthropic-messages.lazy.ts";
import { openAICompletionsApi } from "../api/openai-completions.lazy.ts";
import { openAIResponsesApi } from "../api/openai-responses.lazy.ts";
import { envApiKeyAuth } from "../auth/helpers.ts";
import { createProvider, type Provider } from "../models.ts";
import type { Api, Model } from "../types.ts";
import { OPENCODE_GO_MODELS } from "./opencode-go.models.ts";
import { withOpenCodeSessionHeader } from "./opencode-headers.ts";

type OpenCodeGoApi = "anthropic-messages" | "openai-completions" | "openai-responses";

/**
 * The upstream catalog lists models on APIs this provider does not wire up
 * (e.g. google-generative-ai); those entries are unusable here, so drop them
 * instead of widening the provider's API surface.
 */
function isSupportedApi(model: Model<Api>): model is Model<OpenCodeGoApi> {
	return model.api === "anthropic-messages" || model.api === "openai-completions" || model.api === "openai-responses";
}

export function opencodeGoProvider(): Provider<OpenCodeGoApi> {
	return createProvider<OpenCodeGoApi>({
		id: "opencode-go",
		name: "OpenCode Go",
		auth: { apiKey: envApiKeyAuth("OpenCode API key", ["OPENCODE_API_KEY"]) },
		models: (Object.values(OPENCODE_GO_MODELS) as Model<Api>[]).filter(isSupportedApi),
		api: {
			"anthropic-messages": withOpenCodeSessionHeader(anthropicMessagesApi()),
			"openai-completions": withOpenCodeSessionHeader(openAICompletionsApi()),
			"openai-responses": withOpenCodeSessionHeader(openAIResponsesApi()),
		},
	});
}
