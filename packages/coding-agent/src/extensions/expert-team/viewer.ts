/**
 * Transcript viewer for one expert team run: question header, per-expert answers,
 * and the synthesis. Escape or Ctrl+C closes.
 */

import { Container, Markdown, matchesKey, Spacer, Text } from "@earendil-works/pi-tui";
import { DynamicBorder } from "../../modes/interactive/components/dynamic-border.ts";
import { keyHint } from "../../modes/interactive/components/keybinding-hints.ts";
import { getMarkdownTheme, type Theme } from "../../modes/interactive/theme/theme.ts";

interface ExpertAnswer {
	expert: string;
	text: string;
}

interface ExpertRun {
	question: string;
	answers: ExpertAnswer[];
	synthesis: string;
	timestamp: number;
}

export class ExpertTranscriptViewer extends Container {
	private readonly run: ExpertRun;
	private readonly theme: Theme;
	private readonly onClose: () => void;

	constructor(run: ExpertRun, theme: Theme, onClose: () => void) {
		super();
		this.run = run;
		this.theme = theme;
		this.onClose = onClose;
		this.rebuild();
	}

	override invalidate(): void {
		this.rebuild();
		super.invalidate();
	}

	private rebuild(): void {
		this.clear();
		const th = this.theme;
		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));
		this.addChild(new Text(th.fg("accent", th.bold(" Expert Team Transcript ")), 1, 0));
		this.addChild(new Text(th.fg("muted", new Date(this.run.timestamp).toLocaleString()), 1, 0));
		this.addChild(new Text(th.fg("text", th.bold("Q: ")) + th.fg("text", this.run.question), 1, 0));
		this.addChild(new Spacer(1));
		for (const answer of this.run.answers) {
			this.addChild(new Text(th.fg("accent", `── ${answer.expert}`), 1, 0));
			this.addChild(new Markdown(answer.text, 1, 0, getMarkdownTheme()));
			this.addChild(new Spacer(1));
		}
		this.addChild(new Text(th.fg("success", "── Synthesis"), 1, 0));
		this.addChild(new Markdown(this.run.synthesis, 1, 0, getMarkdownTheme()));
		this.addChild(new Spacer(1));
		this.addChild(new Text(keyHint("tui.select.cancel", "close"), 1, 0));
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.onClose();
		}
	}
}
