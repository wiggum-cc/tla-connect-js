// @ts-check

/**
 * Spawn Apalache MC to generate ITF traces.
 * @module
 */

import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { loadTracesFromDir } from "./loader.js";

/**
 * @typedef {Object} ApalacheConfig
 * @property {string} spec       - path to .tla file
 * @property {string} inv        - invariant name
 * @property {number} [maxLength=15]
 * @property {"check"|"simulate"} [mode="check"]
 * @property {string} [outDir]   - defaults to temp dir
 * @property {string} [apalacheBin="apalache-mc"]
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
  } = config;

  const args = [
    mode,
    `--inv=${inv}`,
    `--length=${maxLength}`,
    `--out-dir=${outDir}`,
    spec,
  ];

  const { exitCode, stdout, stderr } = await spawnAsync(apalacheBin, args);

  // Exit code 12 = counterexample found (expected for reachability checks)
  if (exitCode !== 0 && exitCode !== 12) {
    throw new Error(
      `Apalache exited with code ${exitCode}\nstdout: ${stdout}\nstderr: ${stderr}`
    );
  }

  const traces = loadTracesFromDir(outDir);
  return { traces, outDir };
}

/**
 * Spawn a process and collect stdout/stderr.
 * @param {string} cmd
 * @param {string[]} args
 * @returns {Promise<{ exitCode: number | null, stdout: string, stderr: string }>}
 */
function spawnAsync(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks = /** @type {Buffer[]} */ ([]);
    const errChunks = /** @type {Buffer[]} */ ([]);

    child.stdout.on("data", (/** @type {Buffer} */ c) => chunks.push(c));
    child.stderr.on("data", (/** @type {Buffer} */ c) => errChunks.push(c));

    child.on("error", reject);
    child.on("close", (/** @type {number | null} */ exitCode) => {
      resolve({
        exitCode,
        stdout: Buffer.concat(chunks).toString("utf-8"),
        stderr: Buffer.concat(errChunks).toString("utf-8"),
      });
    });
  });
}
