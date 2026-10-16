/**
 * Splash renderer contract.
 *
 * A renderer is a pure `state -> lines` mapping. It never touches timers, the TUI, or the terminal:
 * the orchestrator in `splash.ts` owns the animation loop and hands the elapsed time in, so every
 * renderer stays deterministic and testable.
 */

/**
 * @param width Available columns. Every returned line must have `visibleWidth <= width`; the TUI
 *   errors on wider lines.
 * @param elapsedMs Milliseconds since the splash started. The orchestrator supplies it so the phase
 *   stays continuous across a blocked event loop, and so tests can pin a frame.
 */
export type SplashRenderer = (width: number, elapsedMs: number) => string[];

/** Below this width, renderers that draw across the full terminal fall back to a compact center. */
export const NARROW_TERMINAL_WIDTH = 40;

/**
 * Discrete step in `0..steps-1` at `elapsedMs`, advancing one step every `tickMs`.
 *
 * The existing wave advanced its phase once per 90 ms tick, so it maps to `tickMs = 90` and its
 * character count as the step count. Keeping the tick explicit (rather than deriving a fraction of a
 * fixed cycle) is what lets that renderer reproduce its previous output exactly.
 */
export function loopStep(elapsedMs: number, steps: number, tickMs: number): number {
	const ticks = Math.floor(Math.max(0, elapsedMs) / tickMs);
	return ((ticks % steps) + steps) % steps;
}

/** Continuous 0..1 loop position at `elapsedMs`, for renderers that interpolate instead of stepping. */
export function loopPosition(elapsedMs: number, cycleMs: number): number {
	const cycle = ((elapsedMs % cycleMs) + cycleMs) % cycleMs;
	return cycle / cycleMs;
}
