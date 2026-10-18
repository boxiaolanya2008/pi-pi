/**
 * Startup probe: proves the shell loads, the agent starts, and the window can be scripted.
 *
 * Run with `node scripts/smoke.mjs`. Exits non-zero on the first failure so it can gate a release. It
 * checks the things a build cannot: that the real Electron runtime boots, that the SDK loads inside it,
 * that a session starts, and that the renderer actually painted.
 */

import { spawn } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = dirname(here);
const repoRoot = dirname(dirname(appRoot));
const electronBinary = join(repoRoot, "node_modules", "electron", "dist", "electron.exe");
// The probe runs from `dist/`, so that is where the result lands.
const probeFile = join(appRoot, "dist", ".smoke-result.json");
const errorLog = join(appRoot, ".smoke-stderr.log");

rmSync(probeFile, { force: true });
rmSync(errorLog, { force: true });

const child = spawn(electronBinary, [appRoot, "--smoke"], {
	env: { ...process.env, PI_DESKTOP_SMOKE: "1", ELECTRON_ENABLE_LOGGING: "1" },
	stdio: ["ignore", "pipe", "pipe"],
});

let stderr = "";
child.stderr.on("data", (chunk) => {
	stderr += String(chunk);
});

/** Fail with the captured stderr, which is where Electron explains itself. */
function fail(reason) {
	console.error(`FAIL: ${reason}`);
	if (stderr.trim()) console.error(`--- stderr ---\n${stderr.trim().split("\n").slice(0, 20).join("\n")}`);
	child.kill();
	process.exitCode = 1;
}

const timeout = setTimeout(() => {
	fail("timed out after 60s waiting for the smoke probe");
}, 60_000);

child.on("exit", () => {
	clearTimeout(timeout);
	let result;
	try {
		result = JSON.parse(readFileSync(probeFile, "utf-8"));
	} catch {
		fail("the app exited without writing a probe result");
		return;
	}

	const checks = [
		["window created", result.windowCreated],
		["renderer painted", result.rendererPainted],
		["agent session ready", result.sessionReady],
		["tools exposed", (result.toolCount ?? 0) > 0],
		["commands registered", (result.commandCount ?? 0) > 0],
		["models available", (result.modelCount ?? 0) > 0],
	];
	let ok = true;
	for (const [label, passed] of checks) {
		console.log(`${passed ? "ok  " : "FAIL"} ${label}`);
		if (!passed) ok = false;
	}
	if (result.toolCount !== undefined) console.log(`     tools: ${result.toolCount}`);
	if (result.commandCount !== undefined) console.log(`     commands: ${result.commandCount}`);
	if (result.modelCount !== undefined) console.log(`     models: ${result.modelCount}`);
	if (stderr.trim()) console.log(`--- stderr ---\n${stderr.trim().split("\n").slice(0, 10).join("\n")}`);
	process.exitCode = ok ? 0 : 1;
});

	writeFileSync(errorLog, stderr, "utf-8");
