/**
 * The pi logo breathing under a ring of orbiting light.
 *
 * Reuses the mark from `pi-logo.ts`, so the splash and the startup header show the same logo and the
 * same Apple Terminal fallback applies. The glow is drawn around the mark, keeping the splash at three
 * rows like the wave it replaces.
 *
 * The row is assembled as `glow cells + mark + glow cells`, never by slicing a rendered string: styled
 * cells are multi-character ANSI sequences, so a string index is not a terminal column.
 */

import { visibleWidth } from "@earendil-works/pi-tui";
import { theme } from "../../theme/theme.ts";
import { piLogoLines, piWordmark } from "../pi-logo.ts";
import { loopPosition, NARROW_TERMINAL_WIDTH, type SplashRenderer } from "./types.ts";

const ROWS = 3;
/** One breath-and-orbit, long enough to read as calm rather than busy. */
const CYCLE_MS = 2600;
/** Widest the glow band grows before it stops eating columns from the mark. */
const MAX_GLOW_WIDTH = 26;

/** Glow characters by intensity; the ring picks by how close a cell is to the orbit path. */
const GLOW = ["·", "•", "◦", "◌"];

/** The mark as display lines: the two-line half-block logo, or the wordmark where half blocks break. */
function markLines(width: number): string[] {
	return width < NARROW_TERMINAL_WIDTH ? [piWordmark()] : piLogoLines();
}

export const renderLogoPulse: SplashRenderer = (width, elapsedMs) => {
	const phase = loopPosition(elapsedMs, CYCLE_MS);
	// Breath runs 0 -> 1 -> 0 across the cycle, so the mark swells and settles.
	const breath = (1 - Math.cos(phase * Math.PI * 2)) / 2;

	const mark = markLines(width);
	const markWidth = Math.max(...mark.map((line) => visibleWidth(line)));

	// Share the row between the mark and its glow. On a narrow terminal there is no room for a ring, so
	// the mark is centered alone rather than drawn inside a broken arc.
	const glowWidth = width < NARROW_TERMINAL_WIDTH ? 0 : Math.min(MAX_GLOW_WIDTH, Math.max(0, width - markWidth - 6));

	const ringCenterY = (ROWS - 1) / 2;
	const radius = glowWidth / 2 + 1 + breath * 2;
	const markLeft =
		glowWidth === 0 ? Math.max(0, Math.floor((width - markWidth) / 2)) : leftEdge(markWidth, glowWidth, width);
	const ringCenterX = glowWidth === 0 ? width / 2 : markLeft + glowWidth / 2;

	const lines: string[] = [];
	for (let row = 0; row < ROWS; row++) {
		let line = "";
		// Cells before the mark.
		for (let x = 0; x < markLeft; x++) line += ringCell(x, row, ringCenterX, ringCenterY, radius, phase, glowWidth);
		// The mark itself, kept as one styled string so its ANSI sequences are never split.
		const markRow = mark[row];
		if (markRow) line += markRow;
		// Cells after the mark. Columns are counted in terminal cells, not string characters.
		for (let x = markLeft + markWidth; x < width; x++) {
			line += ringCell(x, row, ringCenterX, ringCenterY, radius, phase, glowWidth);
		}
		lines.push(line);
	}
	return lines;
};

/** Left column of the mark, keeping the mark and its ring together as one centered group. */
function leftEdge(markWidth: number, glowWidth: number, width: number): number {
	const group = markWidth + glowWidth + 2;
	return Math.max(0, Math.floor((width - group) / 2));
}

/**
 * Character for one cell: the nearest of three travelling highlights, else the faint ring. Returns a
 * single space when there is no ring (`glowWidth === 0`) or the cell is off the orbit path.
 */
function ringCell(
	x: number,
	row: number,
	centerX: number,
	centerY: number,
	radius: number,
	phase: number,
	glowWidth: number,
): string {
	if (glowWidth <= 0) return " ";

	for (let slot = 0; slot < 3; slot++) {
		const angle = phase * Math.PI * 2 + (slot * Math.PI * 2) / 3;
		const ox = centerX + Math.cos(angle) * radius;
		// The ring is squashed vertically so it stays inside three rows.
		const oy = centerY + Math.sin(angle) * radius * 0.5;
		if (Math.abs(x - ox) < 0.6 && Math.abs(row - oy) < 0.6) {
			return theme.fg(slot === 0 ? "accent" : "muted", GLOW[3]);
		}
	}

	const dx = x - centerX;
	const dy = row - centerY;
	const distance = Math.abs(Math.sqrt(dx * dx + dy * dy) - radius);
	if (distance > 0.75) return " ";

	// Fades outward from the orbit path.
	const index = distance > 0.5 ? 0 : distance > 0.25 ? 1 : 2;
	return theme.fg(index === 2 ? "muted" : "dim", GLOW[index]);
}
