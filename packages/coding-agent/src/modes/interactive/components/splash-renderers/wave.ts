/**
 * The original splash: a theme-colored wave with rising particle dots, drawn across three full-width
 * rows. Kept as the default so existing behavior is unchanged.
 *
 * The phase advanced one step per 90 ms tick, which `WAVE_TICK_MS` reproduces, so a frame at the same
 * elapsed time renders exactly what the previous implementation rendered at the same tick.
 */

import { theme } from "../../theme/theme.ts";
import { loopStep, type SplashRenderer } from "./types.ts";

const WAVE_CHARS = "_.-~≈~-.";
/** Matches the phase step of the implementation this renderer replaces. */
const WAVE_TICK_MS = 90;

const ROWS = 3;

export const renderWave: SplashRenderer = (width, elapsedMs) => {
	const phase = loopStep(elapsedMs, WAVE_CHARS.length, WAVE_TICK_MS);
	const lines: string[] = [];
	for (let row = 0; row < ROWS; row++) {
		let line = "";
		for (let x = 0; x < width; x++) {
			const waveIndex = (x + phase + row * 2) % WAVE_CHARS.length;
			// Rising particle dots: a few columns light up per row per phase.
			const isParticle = (x * 7 + phase * 3 + row * 5) % 23 === 0;
			const color = row === 0 ? "muted" : row === 1 ? "accent" : "dim";
			const char = isParticle ? "°" : WAVE_CHARS[waveIndex];
			line += theme.fg(color, char);
		}
		lines.push(line);
	}
	return lines;
};
