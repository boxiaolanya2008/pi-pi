/**
 * Dedicated renderer for one assistant thinking run: a collapsible block with a
 * header line and the reasoning text in italic. Clicking toggles visibility
 * through `onToggle`; the owner owns the collapsed/expanded state.
 */

import { Container, Markdown, type MarkdownTheme, MouseRegion, Text } from "@earendil-works/pi-tui";
import type { MarkdownTransformer } from "../../../core/extensions/types.ts";
import { theme } from "../theme/theme.ts";
import { createMarkdownTransform } from "./markdown-transform.ts";

export interface ThinkingBlockOptions {
	/** Consecutive thinking texts in stream order. */
	blocks: string[];
	/** Whether the owning assistant message is still streaming. */
	streaming: boolean;
	/** Whether the reasoning body is collapsed. */
	hidden: boolean;
	/** Label shown while collapsed or while the model is still thinking. */
	label: string;
	outputPad: number;
	markdownTheme: MarkdownTheme;
	transformers: readonly MarkdownTransformer[];
	/** Called when the block is clicked; the owner flips the hidden state. */
	onToggle: () => void;
}

export class ThinkingBlockComponent extends Container {
	constructor(options: ThinkingBlockOptions) {
		super();
		const { blocks, hidden, label, outputPad, markdownTheme, transformers } = options;
		const header = hidden
			? theme.italic(theme.fg("thinkingText", `▸ ${label}`))
			: theme.fg("muted", theme.bold("▾ Thinking"));
		const body = hidden
			? undefined
			: new Markdown(
					blocks.join("\n\n"),
					outputPad,
					0,
					markdownTheme,
					{ color: (text) => theme.fg("thinkingText", text), italic: true },
					{
						transform: createMarkdownTransform("assistant-thinking", options.streaming, transformers),
					},
				);

		const content: Container = new Container();
		content.addChild(new Text(header, outputPad, 0));
		if (body) content.addChild(body);
		this.addChild(
			new MouseRegion(content, (event) => {
				if (event.type !== "click" || event.button !== "left") return undefined;
				options.onToggle();
				return { handled: true };
			}),
		);
	}
}
