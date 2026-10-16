/**
 * Splash renderer registry.
 *
 * `wave` is the default and reproduces the original splash exactly. `logo-pulse` is the calm option,
 * `particle-storm` the busy one for long downloads. Selecting an unknown style falls back to `wave`
 * rather than failing: a decorative startup effect must never block startup.
 */

import { renderLogoPulse } from "./logo-pulse.ts";
import { renderParticleStorm } from "./particle-storm.ts";
import { NARROW_TERMINAL_WIDTH, type SplashRenderer } from "./types.ts";
import { renderWave } from "./wave.ts";

export type SplashStyle = "wave" | "logo-pulse" | "particle-storm" | "off";

const RENDERERS: Record<Exclude<SplashStyle, "off">, SplashRenderer> = {
	wave: renderWave,
	"logo-pulse": renderLogoPulse,
	"particle-storm": renderParticleStorm,
};

export const SPLASH_STYLES: readonly SplashStyle[] = ["wave", "logo-pulse", "particle-storm", "off"];

export function isSplashStyle(value: unknown): value is SplashStyle {
	return typeof value === "string" && (SPLASH_STYLES as readonly string[]).includes(value);
}

/**
 * Resolve the renderer for a style at a given width.
 *
 * `particle-storm` needs room to spread a field, so on a narrow terminal it degrades to `logo-pulse`,
 * which centers a compact mark instead of drawing a broken arc. Width is only known at render time,
 * so this is called per frame rather than once at construction.
 */
export function resolveSplashRenderer(style: SplashStyle, width: number): SplashRenderer {
	if (style === "off") return renderWave;
	if (style === "particle-storm" && width < NARROW_TERMINAL_WIDTH) return renderLogoPulse;
	return RENDERERS[style] ?? renderWave;
}

export { NARROW_TERMINAL_WIDTH };
export type { SplashRenderer };
