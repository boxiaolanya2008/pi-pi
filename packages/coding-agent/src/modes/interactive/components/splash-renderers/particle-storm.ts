/**
 * A braille dust field drifting outward from the center, for the long part of startup (fd/rg downloads).
 *
 * Deterministic: every particle's position comes from a hash of its index and the elapsed time, never
 * `Math.random()`, so a given `elapsedMs` always renders the same frame and tests can pin it. Braille
 * gives four vertical dots per cell, which buys density without a taller splash.
 */

import { theme } from "../../theme/theme.ts";
import { loopPosition, NARROW_TERMINAL_WIDTH, type SplashRenderer } from "./types.ts";

const ROWS = 5;
/** One full outward sweep and reset. */
const CYCLE_MS = 3400;
const PARTICLE_COUNT = 48;

/**
 * Integer hash. Returns a value in `[0, 1)`. Used for both a particle's stable traits and its
 * per-frame jitter, so nothing depends on iteration order or floating-point accumulation.
 */
function hash01(seed: number): number {
	let value = seed | 0;
	value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
	value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
	value = value ^ (value >>> 16);
	return (value >>> 0) / 4294967296;
}

/** Braille dot bit for a position inside one cell. Rows run top to bottom, columns left to right. */
const DOT_BITS: readonly (readonly [number, number])[] = [
	[0, 0],
	[0, 1],
	[0, 2],
	[1, 0],
	[1, 1],
	[1, 2],
	[0, 3],
	[1, 3],
];

function braille(dots: number): string {
	return String.fromCharCode(0x2800 + dots);
}

export const renderParticleStorm: SplashRenderer = (width, elapsedMs) => {
	const phase = loopPosition(elapsedMs, CYCLE_MS);
	const centerX = width / 2;
	const centerY = ROWS / 2;
	// The field reaches the corners of the splash band by the end of the cycle.
	const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);

	// Accumulate dots per cell, then emit one braille glyph per occupied cell.
	const dots = new Map<number, number>();

	for (let index = 0; index < PARTICLE_COUNT; index++) {
		// Each particle starts at its own offset in the cycle, so the field is never empty.
		const offset = hash01(index * 2 + 1);
		const travel = (phase + offset) % 1;
		const radius = travel * maxRadius;

		// Angle drifts per particle; the index keeps it stable between frames.
		const baseAngle = hash01(index * 2 + 2) * Math.PI * 2;
		const spin = baseAngle + travel * 1.6;
		const wobble = (hash01(index + 977) - 0.5) * 0.6;

		const x = centerX + Math.cos(spin) * (radius + wobble);
		// Squashed vertically so particles stay inside the band.
		const y = centerY + Math.sin(spin) * (radius + wobble) * 0.42;

		const column = Math.floor(x);
		const row = Math.floor(y);
		if (column < 0 || column >= width || row < 0 || row >= ROWS) continue;

		const [dotRow, dotColumn] = DOT_BITS[Math.floor(hash01(index + 31) * DOT_BITS.length)]!;
		const key = row * width + column;
		dots.set(key, (dots.get(key) ?? 0) | (1 << (dotRow * 2 + dotColumn)));

		// Leave a faint trail behind each particle, thinning with distance from its head.
		const trailColumn = Math.floor(centerX + Math.cos(spin - 0.12) * (radius + wobble));
		const trailRow = Math.floor(centerY + Math.sin(spin - 0.12) * (radius + wobble) * 0.42);
		if (trailColumn >= 0 && trailColumn < width && trailRow >= 0 && trailRow < ROWS) {
			const trailKey = trailRow * width + trailColumn;
			dots.set(trailKey, (dots.get(trailKey) ?? 0) | (1 << (dotRow * 2 + dotColumn)));
		}
	}

	const lines: string[] = [];
	for (let row = 0; row < ROWS; row++) {
		let line = "";
		for (let column = 0; column < width; column++) {
			const bits = dots.get(row * width + column);
			line += bits ? theme.fg(colorFor(bits, phase), braille(bits)) : " ";
		}
		lines.push(line);
	}
	return lines;
};

/**
 * Leading dot carries the accent, the rest fade out. Density is a decent proxy for "newest" here
 * because overlapping particles are what accumulate the most dots in one cell.
 */
function colorFor(bits: number, phase: number): "accent" | "muted" | "dim" {
	const density = countBits(bits);
	if (density >= 3) return "accent";
	if (density === 2) return "muted";
	return phase > 0.5 ? "dim" : "muted";
}

function countBits(bits: number): number {
	let count = 0;
	let value = bits;
	while (value) {
		count += value & 1;
		value >>= 1;
	}
	return count;
}

/** Rows this renderer wants; exported so narrow terminals can check before mounting it. */
export const PARTICLE_STORM_ROWS = ROWS;

/** Whether the terminal is too narrow for a spread field. */
export function particleStormFits(width: number): boolean {
	return width >= NARROW_TERMINAL_WIDTH;
}
