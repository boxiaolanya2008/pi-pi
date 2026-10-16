/**
 * Splash renderer tests.
 *
 * The renderers are pure `(width, elapsedMs) -> string[]` functions, so every frame can be pinned.
 * The important one is `wave`: it must reproduce the splash this replaced, byte for byte, or startup
 * output changes for every existing user.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { SplashAnimation } from "../src/modes/interactive/components/splash.ts";
import {
	isSplashStyle,
	NARROW_TERMINAL_WIDTH,
	resolveSplashRenderer,
	SPLASH_STYLES,
} from "../src/modes/interactive/components/splash-renderers/index.ts";
import { renderLogoPulse } from "../src/modes/interactive/components/splash-renderers/logo-pulse.ts";
import { renderParticleStorm } from "../src/modes/interactive/components/splash-renderers/particle-storm.ts";
import { loopPosition, loopStep } from "../src/modes/interactive/components/splash-renderers/types.ts";
import { renderWave } from "../src/modes/interactive/components/splash-renderers/wave.ts";
import { initTheme, theme } from "../src/modes/interactive/theme/theme.ts";

initTheme(undefined, false);

const RENDERERS = {
	wave: renderWave,
	"logo-pulse": renderLogoPulse,
	"particle-storm": renderParticleStorm,
};

const WIDTHS = [20, 40, 80, 200];
const TIMES = [0, 33, 90, 250, 1000, 5000];

describe("Splash renderers", () => {
	describe("Shared contract", () => {
		for (const [name, renderer] of Object.entries(RENDERERS)) {
			it(`${name} never exceeds the terminal width`, () => {
				// Renderers may draw ragged; SplashAnimation pads to the full width.
				for (const width of WIDTHS) {
					for (const elapsedMs of TIMES) {
						for (const line of renderer(width, elapsedMs)) {
							assert.ok(
								visibleWidth(line) <= width,
								`${name} produced a line of width ${visibleWidth(line)} > ${width} at t=${elapsedMs}`,
							);
						}
					}
				}
			});

			it(`${name} is deterministic for a given elapsed time`, () => {
				for (const width of [40, 80]) {
					for (const elapsedMs of TIMES) {
						assert.deepStrictEqual(
							renderer(width, elapsedMs),
							renderer(width, elapsedMs),
							`${name} was not reproducible at width ${width}, t=${elapsedMs}`,
						);
					}
				}
			});

			it(`${name} advances over time`, () => {
				// The wave steps every 90 ms; the other two interpolate, so a 1200 ms gap moves both.
				assert.notStrictEqual(
					renderer(80, 0).join(""),
					renderer(80, 1200).join(""),
					`${name} did not change between t=0 and t=1200`,
				);
			});

			it(`${name} emits only complete escape sequences`, () => {
				// A line may end with a plain space after styled cells, so this checks well-formedness rather
				// than a trailing reset: every CSI sequence must close with a letter.
				for (const line of renderer(80, 500)) {
					for (const match of line.matchAll(/\x1b\[([0-9;]*)m/g)) {
						assert.ok(
							match[0].endsWith("m"),
							`${name} emitted a malformed sequence: ${JSON.stringify(match[0])}`,
						);
					}
					const stripped = line.replace(/\x1b\[[0-9;]*m/g, "");
					assert.doesNotMatch(stripped, /\x1b/, `${name} left a stray escape character outside a sequence`);
				}
			});
		}
	});

	describe("wave", () => {
		it("reproduces the previous implementation byte for byte", () => {
			// The original advanced `phase` once per 90 ms tick and drew three full-width rows.
			const WAVE_CHARS = "_.-~≈~-.";
			const original = (width: number, phase: number): string[] => {
				const lines: string[] = [];
				for (let row = 0; row < 3; row++) {
					let line = "";
					for (let x = 0; x < width; x++) {
						const waveIndex = (x + phase + row * 2) % WAVE_CHARS.length;
						const isParticle = (x * 7 + phase * 3 + row * 5) % 23 === 0;
						const color = row === 0 ? "muted" : row === 1 ? "accent" : "dim";
						const char = isParticle ? "°" : WAVE_CHARS[waveIndex];
						line += theme.fg(color, char);
					}
					lines.push(line);
				}
				return lines;
			};

			for (const width of [40, 80]) {
				for (const elapsedMs of [0, 90, 180, 500, 1000, 1234]) {
					const phase = loopStep(elapsedMs, WAVE_CHARS.length, 90);
					assert.deepStrictEqual(
						renderWave(width, elapsedMs),
						original(width, phase),
						`wave diverged at width ${width}, t=${elapsedMs}`,
					);
				}
			}
		});

		it("advances one step per 90 ms tick", () => {
			const at = (elapsedMs: number) => renderWave(40, elapsedMs).join("");
			assert.strictEqual(at(0), at(89));
			assert.notStrictEqual(at(89), at(90));
		});
	});

	describe("loop helpers", () => {
		it("wraps steps into range", () => {
			for (const t of [0, 89, 90, 1000, 100000]) {
				const step = loopStep(t, 8, 90);
				assert.ok(Number.isInteger(step) && step >= 0 && step < 8, `step out of range at t=${t}: ${step}`);
			}
		});

		it("treats a negative elapsed time as the start", () => {
			assert.strictEqual(loopStep(-100, 8, 90), 0);
		});

		it("returns a 0..1 position and wraps", () => {
			assert.strictEqual(loopPosition(0, 1000), 0);
			assert.ok(Math.abs(loopPosition(250, 1000) - 0.25) < 1e-9);
			assert.ok(Math.abs(loopPosition(1250, 1000) - 0.25) < 1e-9);
		});
	});

	describe("Registry", () => {
		it("recognizes known styles only", () => {
			for (const style of SPLASH_STYLES) assert.ok(isSplashStyle(style), `${style} should be valid`);
			for (const value of ["nope", "", 42, null, undefined]) {
				assert.strictEqual(isSplashStyle(value), false, `${JSON.stringify(value)} should be invalid`);
			}
		});

		it("falls back to wave for an unknown style", () => {
			const fallback = resolveSplashRenderer("nonsense" as never, 80);
			assert.deepStrictEqual(fallback(80, 500), renderWave(80, 500));
		});

		it("treats off as wave at the renderer level, so a stale style cannot break startup", () => {
			assert.deepStrictEqual(resolveSplashRenderer("off", 80)(80, 500), renderWave(80, 500));
		});

		it("degrades particle-storm to logo-pulse on a narrow terminal", () => {
			const narrow = NARROW_TERMINAL_WIDTH - 1;
			assert.deepStrictEqual(
				resolveSplashRenderer("particle-storm", narrow)(narrow, 500),
				renderLogoPulse(narrow, 500),
			);
		});

		it("keeps particle-storm on a wide terminal", () => {
			assert.deepStrictEqual(resolveSplashRenderer("particle-storm", 120)(120, 500), renderParticleStorm(120, 500));
		});
	});

	describe("logo-pulse", () => {
		it("draws something on a narrow terminal instead of a broken ring", () => {
			const lines = renderLogoPulse(20, 600);
			assert.ok(
				lines.some((line) => visibleWidth(stripped(line)) > 0),
				"expected the mark to be drawn on a narrow terminal",
			);
		});
	});

	describe("SplashAnimation", () => {
		it("pads every line to the full width", () => {
			// Differential rendering only rewrites changed lines, so a short line leaves stale cells.
			const splash = new SplashAnimation(stubTui());
			for (const style of ["wave", "logo-pulse", "particle-storm"] as const) {
				const styled = new SplashAnimation(stubTui(), style);
				for (const line of styled.render(80)) {
					assert.strictEqual(visibleWidth(line), 80, `${style} left a line at ${visibleWidth(line)} columns`);
				}
			}
			assert.ok(splash.render(80).length > 0);
		});

		it("does not start twice", () => {
			const splash = new SplashAnimation(stubTui());
			splash.start();
			splash.start();
			splash.stop();
			splash.stop();
		});
	});
});

/** The splash only calls requestRender, so the rest of the TUI surface stays unused. */
function stubTui() {
	return { requestRender: () => {} } as never;
}

function stripped(line: string): string {
	return line.replace(/\x1b\[[0-9;]*m/g, "");
}
