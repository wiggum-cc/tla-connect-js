// @ts-check

/**
 * Spawn Apalache MC to generate ITF traces.
 * @module
 */

import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { loadTracesFromDir } from "./loader.js";
import { TraceGenError } from "./errors.js";

/**
 * @typedef {Object} ApalacheConfig
 * @property {string} spec       - path to .tla file
 * @property {string} inv        - invariant name
 * @property {number} [maxLength=15]
 * @property {"check"|"simulate"} [mode="check"]
 * @property {string} [outDir]   - defaults to temp dir
 * @property {string} [apalacheBin="apalache-mc"]
 * @property {number} [maxTraces]   - --max-run (simulate) or --max-error (check)
 * @property {string} [view]        - view expression (--view)
 * @property {string} [cinit]       - constant initializer predicate (--cinit)
 * @property {number} [timeout]     - subprocess timeout in milliseconds
 * @property {boolean} [keepOutputs=false] - if false, cleans up temp outDir on success
 */

/**
 * Generate ITF traces by running Apalache MC.
 *
 * @param {ApalacheConfig} config
 * @returns {Promise<{ traces: import("./itf.js").ItfTrace[], outDir: string }>}
 */
export async function generateTraces(config) {
  const {
    spec,
    inv,
    maxLength = 15,
    mode = "check",
    outDir = mkdtempSync(join(tmpdir(), "tla-connect-")),
    apalacheBin = "apalache-mc",
    maxTraces,
    view,
    cinit,
    timeout,
    keepOutputs = false,
  } = config;

  const isTemp = !config.outDir;

  const args = [
    mode,
    `--inv=${inv}`,
    `--length=${maxLength}`,
    `--out-dir=${outDir}`,
  ];

  if (maxTraces != null) {
    if (mode === "simulate") {
      args.push(`--max-run=${maxTraces}`);
    } else {
      args.push(`--max-error=${maxTraces}`);
    }
  }
  if (view) args.push(`--view=${view}`);
  if (cinit) args.push(`--cinit=${cinit}`);

  args.push(spec);

  const { exitCode, stdout, stderr } = await spawnAsync(apalacheBin, args, timeout);

  // Exit code 12 = counterexample found (expected for reachability checks)
  if (exitCode !== 0 && exitCode !== 12) {
    throw new TraceGenError(
      `Apalache exited with code ${exitCode}\nstdout: ${stdout}\nstderr: ${stderr}`,
      exitCode,
      stdout,
      stderr,
    );
  }

  const traces = loadTracesFromDir(outDir);

  if (isTemp && !keepOutputs) {
    try { rmSync(outDir, { recursive: true }); } catch { /* ignore cleanup errors */ }
  }

  return { traces, outDir };
}

/**
 * Spawn a process and collect stdout/stderr, with optional timeout.
 * @param {string} cmd
 * @param {string[]} args
 * @param {number} [timeout]
 * @returns {Promise<{ exitCode: number | null, stdout: string, stderr: string }>}
 */
function spawnAsync(cmd, args, timeout) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks = /** @type {Buffer[]} */ ([]);
    const errChunks = /** @type {Buffer[]} */ ([]);

    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    if (timeout != null && timeout > 0) {
      timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new TraceGenError(`Apalache timed out after ${timeout}ms`));
      }, timeout);
    }

    child.stdout.on("data", (/** @type {Buffer} */ c) => chunks.push(c));
    child.stderr.on("data", (/** @type {Buffer} */ c) => errChunks.push(c));

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(new TraceGenError(err.message));
    });
    child.on("close", (/** @type {number | null} */ exitCode) => {
      if (timer) clearTimeout(timer);
      resolve({
        exitCode,
        stdout: Buffer.concat(chunks).toString("utf-8"),
        stderr: Buffer.concat(errChunks).toString("utf-8"),
      });
    });
  });
}
