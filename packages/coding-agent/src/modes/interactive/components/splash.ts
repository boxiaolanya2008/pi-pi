/**
 * Cold start splash: a theme-colored wave with rising particle dots, played in the
 * startup window while managed tools and extensions load. Purely decorative and
 * non-blocking: it renders on the render loop timer and is removed as soon as the
 * editor becomes interactive, so it never adds startup latency.
 */

import type { Component, TUI } from "@earendil-works/pi-tui";
import { theme } from "../theme/theme.ts";

const WAVE_CHARS = "_.-~≈~-.";
const TICK_MS = 90;

export class SplashAnimation implements Component {
	private timer: ReturnType<typeof setInterval> | undefined;
	private phase = 0;
	private readonly tui: TUI;

	constructor(tui: TUI) {
		this.tui = tui;
	}

	start(): void {
		this.timer = setInterval(() => {
			this.phase = (this.phase + 1) % WAVE_CHARS.length;
			this.tui.requestRender();
		}, TICK_MS);
	}

	stop(): void {
		if (this.timer !== undefined) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}

	render(width: number): string[] {
		const rows = 3;
		const lines: string[] = [];
		for (let row = 0; row < rows; row++) {
			let line = "";
			for (let x = 0; x < width; x++) {
				const waveIndex = (x + this.phase + row * 2) % WAVE_CHARS.length;
				// Rising particle dots: a few columns light up per row per phase.
				const isParticle = (x * 7 + this.phase * 3 + row * 5) % 23 === 0;
				const color = row === 0 ? "muted" : row === 1 ? "accent" : "dim";
				const char = isParticle ? "°" : WAVE_CHARS[waveIndex];
				line += theme.fg(color, char);
			}
			lines.push(line);
		}
		return lines;
	}

	invalidate(): void {
		// Stateless per-render drawing; nothing cached.
	}
}
