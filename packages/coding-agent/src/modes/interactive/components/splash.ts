/**
 * Cold start splash, played in the startup window while managed tools and extensions load. Purely
 * decorative and non-blocking: it renders on the render loop timer and is removed as soon as the
 * editor becomes interactive, so it never adds startup latency.
 *
 * This class is the orchestrator only. It owns the timer and the elapsed time and delegates drawing to
 * a `SplashRenderer`, so the look can be swapped without touching the startup sequence.
 */

import { type Component, type TUI, visibleWidth } from "@earendil-works/pi-tui";
import { resolveSplashRenderer, type SplashStyle } from "./splash-renderers/index.ts";

/**
 * Frame interval. The previous splash used 90 ms, which ran at about 11 fps; 33 ms lands near 30 fps
 * while staying well above the TUI's 16 ms render budget, so frames are not dropped by the renderer.
 */
const TICK_MS = 33;

export class SplashAnimation implements Component {
	private timer: ReturnType<typeof setInterval> | undefined;
	private startedAt = 0;
	private elapsed = 0;
	private readonly tui: TUI;
	private readonly style: SplashStyle;

	constructor(tui: TUI, style: SplashStyle = "wave") {
		this.tui = tui;
		this.style = style;
	}

	start(): void {
		if (this.timer !== undefined) return;
		this.startedAt = Date.now();
		this.elapsed = 0;
		this.timer = setInterval(() => {
			this.elapsed = Date.now() - this.startedAt;
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
		const lines = resolveSplashRenderer(this.style, width)(width, this.elapsed);
		// Differential rendering only rewrites what changed, so a short line would leave stale cells from the
		// previous frame behind. Renderers stay free to draw ragged; the padding happens here.
		return lines.map((line) => {
			const padding = width - visibleWidth(line);
			return padding > 0 ? line + " ".repeat(padding) : line;
		});
	}

	invalidate(): void {
		// Stateless per-render drawing; nothing cached.
	}
}
