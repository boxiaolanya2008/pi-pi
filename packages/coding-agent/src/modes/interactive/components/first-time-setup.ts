import { Container, getKeybindings, Input, Spacer, Text } from "@earendil-works/pi-tui";
import { APP_NAME } from "../../../config.ts";
import { SYSTEM_THEME_NAME } from "../theme/system-theme.ts";
import { theme } from "../theme/theme.ts";
import { DynamicBorder } from "./dynamic-border.ts";
import { keyHint, rawKeyHint } from "./keybinding-hints.ts";

export interface FirstTimeSetupResult {
	theme: string;
	shareAnalytics: boolean;
	customModel?: CustomModelSetup;
}

export interface CustomModelSetup {
	baseUrl: string;
	api: string;
	modelId: string;
	apiKey?: string;
}

export interface FirstTimeSetupOptions {
	onThemePreview: (themeName: string) => void;
	onSubmit: (result: FirstTimeSetupResult) => void;
	onCancel: () => void;
}

type Step = "theme" | "analytics" | "model-choice" | "base-url" | "api-type" | "model-id" | "api-key";

const THEME_OPTIONS: Array<{ value: string; label: string }> = [
	{ value: SYSTEM_THEME_NAME, label: "System (matches your terminal colors)" },
	{ value: "dark", label: "Dark" },
	{ value: "light", label: "Light" },
];

const ANALYTICS_OPTIONS: Array<{ value: boolean; label: string }> = [
	{ value: true, label: "Share anonymous usage data" },
	{ value: false, label: "Don't share" },
];

const MODEL_CHOICE_OPTIONS = ["Configure a custom model (API / Model / Key)", "Skip"];

const API_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
	{ value: "openai-completions", label: "OpenAI-compatible (chat completions)" },
	{ value: "openai-responses", label: "OpenAI Responses API" },
	{ value: "anthropic-messages", label: "Anthropic-compatible" },
	{ value: "google-generative-ai", label: "Google Gemini-compatible" },
];

const SETUP_LOGO_LINES = ["██████", "██  ██", "████  ██", "██    ██"];

/** First-time setup dialog: theme choice, analytics opt-in, and custom model configuration. */
export class FirstTimeSetupComponent extends Container {
	private step: Step = "theme";
	private themeIndex: number;
	private analyticsIndex = 0;
	private modelChoiceIndex = 0;
	private apiTypeIndex = 0;
	private draft: Partial<CustomModelSetup> = {};
	private input: Input | undefined;
	private error: string | undefined;
	private readonly options: FirstTimeSetupOptions;

	constructor(options: FirstTimeSetupOptions) {
		super();
		this.options = options;
		this.themeIndex = 0;
		this.update();
	}

	/** Rebuild on theme changes, e.g. when the system theme receives the terminal's colors. */
	override invalidate(): void {
		this.update();
		super.invalidate();
	}

	// Rebuild the whole dialog on every change so theme previews recolor all text.
	private update(): void {
		this.clear();
		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("accent", SETUP_LOGO_LINES.join("\n")), 1, 0));
		this.addChild(new Spacer(1));
		this.addChild(
			new Text(theme.fg("accent", theme.bold(`Welcome to ${APP_NAME}, the minimal coding agent.`)), 1, 0),
		);
		this.addChild(new Spacer(1));

		switch (this.step) {
			case "theme":
				this.addChild(new Text(theme.fg("text", "Pick a theme."), 1, 0));
				this.addChild(new Spacer(1));
				this.addOptionList(
					THEME_OPTIONS.map((option) => option.label),
					this.themeIndex,
				);
				break;
			case "analytics":
				this.addChild(new Text(theme.fg("text", "Opt-in to anonymous usage data sharing?"), 1, 0));
				this.addChild(
					new Text(
						theme.fg(
							"muted",
							"Opting in stores a tracking identifier in settings.json and enables anonymous\nusage analytics. This helps us to better debug, reproduce, and resolve issues\nand bugs within Pi. You can observe what is shared using /privacy and make\nchanges anytime in settings.json.",
						),
						1,
						0,
					),
				);
				this.addChild(new Spacer(1));
				this.addOptionList(
					ANALYTICS_OPTIONS.map((option) => option.label),
					this.analyticsIndex,
				);
				break;
			case "model-choice":
				this.addChild(
					new Text(
						theme.fg("text", "Connect a model. You can also do this later with /login or models.json."),
						1,
						0,
					),
				);
				this.addChild(new Spacer(1));
				this.addOptionList(MODEL_CHOICE_OPTIONS, this.modelChoiceIndex);
				break;
			case "base-url":
				this.addInputStep("API base URL", "https://api.example.com/v1", this.draft.baseUrl);
				break;
			case "api-type":
				this.addChild(new Text(theme.fg("text", "API type."), 1, 0));
				this.addChild(new Spacer(1));
				this.addOptionList(
					API_TYPE_OPTIONS.map((option) => option.label),
					this.apiTypeIndex,
				);
				break;
			case "model-id":
				this.addInputStep("Model ID", "e.g. claude-sonnet-5 or gpt-6", this.draft.modelId);
				break;
			case "api-key":
				this.addInputStep("API key (any placeholder works for local endpoints)", "sk-...", this.draft.apiKey);
				break;
		}

		if (this.error) {
			this.addChild(new Spacer(1));
			this.addChild(new Text(theme.fg("error", this.error), 1, 0));
		}

		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("dim", this.stepHint()), 1, 0));
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());
	}

	private stepHint(): string {
		if (this.input) {
			return `${rawKeyHint("enter", "continue")}  ${keyHint("tui.select.cancel", "skip setup")}`;
		}
		return (
			rawKeyHint("↑↓", "navigate") +
			"  " +
			keyHint("tui.select.confirm", this.step === "theme" ? "continue" : "select") +
			"  " +
			keyHint("tui.select.cancel", "skip setup")
		);
	}

	private addInputStep(label: string, placeholder: string, value: string | undefined): void {
		this.addChild(new Text(theme.fg("text", `${label}:`), 1, 0));
		this.addChild(new Spacer(1));
		if (!this.input) {
			this.input = new Input({ prompt: "> ", placeholder });
			this.input.focused = true;
			this.input.onSubmit = (submitted: string) => this.submitInput(submitted);
		}
		if (value && this.input.getValue() === "") {
			this.input.setValue(value);
		}
		this.addChild(this.input);
	}

	private submitInput(submitted: string): void {
		const value = submitted.trim();
		if (this.step === "base-url") {
			if (!/^https?:\/\//.test(value)) {
				this.error = "Base URL must start with http:// or https://";
				this.update();
				return;
			}
			this.draft.baseUrl = value;
			this.enterStep("api-type");
			return;
		}
		if (this.step === "model-id") {
			if (!value) {
				this.error = "Model ID is required";
				this.update();
				return;
			}
			this.draft.modelId = value;
			this.enterStep("api-key");
			return;
		}
		if (this.step === "api-key") {
			if (!value) {
				this.error = "API key is required (use any placeholder for local endpoints)";
				this.update();
				return;
			}
			this.finishSetup(value);
		}
	}

	private enterStep(step: Step): void {
		this.step = step;
		this.error = undefined;
		this.input = undefined;
		this.update();
	}

	private finishSetup(apiKey: string | undefined): void {
		const baseUrl = this.draft.baseUrl;
		const api = this.draft.api;
		const modelId = this.draft.modelId;
		if (!baseUrl || !api || !modelId) {
			this.enterStep("model-choice");
			return;
		}
		this.options.onSubmit({
			theme: THEME_OPTIONS[this.themeIndex].value,
			shareAnalytics: ANALYTICS_OPTIONS[this.analyticsIndex].value,
			customModel: { baseUrl, api, modelId, ...(apiKey ? { apiKey } : {}) },
		});
	}

	private addOptionList(labels: string[], selectedIndex: number): void {
		for (let i = 0; i < labels.length; i++) {
			const isSelected = i === selectedIndex;
			const prefix = isSelected ? theme.fg("accent", "→ ") : "  ";
			const label = isSelected ? theme.fg("accent", labels[i]) : theme.fg("text", labels[i]);
			this.addChild(new Text(`${prefix}${label}`, 1, 0));
		}
	}

	private moveSelection(delta: number): void {
		if (this.step === "theme") {
			const next = Math.max(0, Math.min(THEME_OPTIONS.length - 1, this.themeIndex + delta));
			if (next !== this.themeIndex) {
				this.themeIndex = next;
				this.options.onThemePreview(THEME_OPTIONS[this.themeIndex].value);
			}
		} else if (this.step === "analytics") {
			this.analyticsIndex = Math.max(0, Math.min(ANALYTICS_OPTIONS.length - 1, this.analyticsIndex + delta));
		} else if (this.step === "model-choice") {
			this.modelChoiceIndex = Math.max(0, Math.min(MODEL_CHOICE_OPTIONS.length - 1, this.modelChoiceIndex + delta));
		} else if (this.step === "api-type") {
			this.apiTypeIndex = Math.max(0, Math.min(API_TYPE_OPTIONS.length - 1, this.apiTypeIndex + delta));
		}
		this.update();
	}

	private confirmList(): void {
		switch (this.step) {
			case "theme":
				this.enterStep("analytics");
				return;
			case "analytics":
				this.enterStep("model-choice");
				return;
			case "model-choice":
				if (this.modelChoiceIndex === 0) {
					this.enterStep("base-url");
				} else {
					this.options.onSubmit({
						theme: THEME_OPTIONS[this.themeIndex].value,
						shareAnalytics: ANALYTICS_OPTIONS[this.analyticsIndex].value,
					});
				}
				return;
			case "api-type":
				this.draft.api = API_TYPE_OPTIONS[this.apiTypeIndex].value;
				this.enterStep("model-id");
				return;
			default:
		}
	}

	handleInput(keyData: string): void {
		const kb = getKeybindings();
		if (kb.matches(keyData, "tui.select.cancel")) {
			this.options.onCancel();
			return;
		}
		// Text entry steps delegate to the input field; escape above already handled.
		if (this.input) {
			if (kb.matches(keyData, "tui.input.submit") || keyData === "\n" || keyData === "\r") {
				this.submitInput(this.input.getValue());
			} else {
				this.input.handleInput(keyData);
			}
			this.update();
			return;
		}
		if (kb.matches(keyData, "tui.select.up") || keyData === "k") {
			this.moveSelection(-1);
		} else if (kb.matches(keyData, "tui.select.down") || keyData === "j") {
			this.moveSelection(1);
		} else if (kb.matches(keyData, "tui.select.confirm") || keyData === "\n") {
			this.confirmList();
		}
	}
}
