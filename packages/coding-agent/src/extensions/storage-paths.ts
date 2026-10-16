/**
 * Shared storage root for Pi-Pi user data.
 *
 * Windows: %APPDATA%/.pipi — elsewhere: $XDG_CONFIG_HOME/.pipi or ~/.config/.pipi.
 */

import { homedir } from "node:os";
import { join } from "node:path";

/** Per-OS app-config base directory. */
export function appDataDir(): string {
	return process.env.APPDATA ?? process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
}

/** Pi-Pi data root: %APPDATA%/.pipi (Windows) or equivalent config dir elsewhere. */
export const PIPI_DIR = join(appDataDir(), ".pipi");

/** Single append-only user-profile file. */
export const REVERIE_PATH = join(PIPI_DIR, "reverie.md");

/**
 * Plan documents directory. The workspace segment is the literal placeholder
 * `--工作区example--` (replaced when workspace mapping lands).
 */
export const PLAN_WORKSPACE_DIR = "--工作区example--";
export const PLAN_DIR = join(PIPI_DIR, "plan", PLAN_WORKSPACE_DIR);
