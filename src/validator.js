// @ts-check

/**
 * Approach 3, part 2: Trace validation via Apalache.
 * @module
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { ValidationError, TraceGenError } from "./errors.js";

/**
 * @typedef {Object} TraceValidatorConfig
 * @property {string} traceSpec   - path to main .tla spec that references the trace module
 * @property {string} init        - init predicate name
 * @property {string} next        - next-state relation name
 * @property {string} inv         - invariant to check (will be inverted)
 * @property {string} [cinit]     - constant initializer predicate
 * @property {string} [apalacheBin="apalache-mc"]
 * @property {number} [timeout]   - subprocess timeout in ms
 */

/**
 * Validate an NDJSON trace file against a TLA+ spec.
 *
 * @param {TraceValidatorConfig} config
 * @param {string} tracePath - path to NDJSON trace file
 * @returns {Promise<{ valid: boolean, reason?: string }>}
 */
export async function validateTrace(config, tracePath) {
  const {
    traceSpec,
    init,
    next,
    inv,
    cinit,
    apalacheBin = "apalache-mc",
    timeout,
  } = config;

  // Read and parse NDJSON
  const content = readFileSync(tracePath, "utf-8").trim();
  if (!content) {
    return { valid: false, reason: "Trace file is empty" };
  }

  const lines = content.split("\n");
  /** @type {Record<string, unknown>[]} */
  const objects = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      const parsed = JSON.parse(lines[i]);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return { valid: false, reason: `Line ${i + 1} is not a JSON object` };
      }
      objects.push(parsed);
    } catch (e) {
      return { valid: false, reason: `Line ${i + 1} is not valid JSON` };
    }
  }

  // Generate TLA+ trace module
  const tlaModule = ndjsonToTlaModule(objects);

  // Write to temp dir
  const dir = mkdtempSync(join(tmpdir(), "tla-validate-"));
  const modulePath = join(dir, "TraceData.tla");
  writeFileSync(modulePath, tlaModule, "utf-8");

  try {
    const args = [
      "check",
      `--init=${init}`,
      `--next=${next}`,
      `--inv=${inv}`,
      `--length=${objects.length}`,
    ];
    if (cinit) args.push(`--cinit=${cinit}`);
    args.push(traceSpec);

    const { exitCode, stdout, stderr } = await spawnAsync(apalacheBin, args, timeout);

    // Exit code 12 = counterexample found = invariant violated = trace is valid
    if (exitCode === 12) {
      return { valid: true };
    }
    // Exit code 0 = no counterexample = invariant holds = trace invalid
    if (exitCode === 0) {
      return { valid: false, reason: "Apalache found no counterexample: trace does not satisfy spec" };
    }

    return { valid: false, reason: `Apalache exited with code ${exitCode}: ${stderr || stdout}` };
  } finally {
    try { rmSync(dir, { recursive: true }); } catch { /* ignore */ }
  }
}

/**
 * Convert an array of NDJSON objects to a TLA+ TraceData module string.
 *
 * @param {Record<string, unknown>[]} objects
 * @returns {string}
 */
export function ndjsonToTlaModule(objects) {
  if (objects.length === 0) {
    throw new ValidationError("Cannot generate TLA+ module from empty trace");
  }

  // Validate schema consistency: all objects must have same keys
  const refKeys = Object.keys(objects[0]).sort();
  for (let i = 1; i < objects.length; i++) {
    const keys = Object.keys(objects[i]).sort();
    if (keys.length !== refKeys.length || !keys.every((k, j) => k === refKeys[j])) {
      throw new ValidationError(
        `Schema inconsistency: line 1 has keys [${refKeys.join(", ")}] but line ${i + 1} has keys [${keys.join(", ")}]`
      );
    }
  }

  // Validate no floats
  for (let i = 0; i < objects.length; i++) {
    for (const [key, val] of Object.entries(objects[i])) {
      validateNoFloats(val, i + 1, key);
    }
  }

  // Build TLA+ module
  const lines = [
    "---- MODULE TraceData ----",
    `EXTENDS Integers, Sequences`,
    "",
    `TraceLen == ${objects.length}`,
    "",
  ];

  // Generate typed trace data
  for (const key of refKeys) {
    const values = objects.map((obj) => jsonToTla(obj[key]));
    lines.push(`trace_${key} == <<${values.join(", ")}>>`);
  }

  lines.push("");

  // Type annotations (Snowcat)
  lines.push("\\* Type annotations for Snowcat");
  for (const key of refKeys) {
    const typ = inferTlaType(objects[0][key]);
    lines.push(`\\* @type: Seq(${typ});`);
    lines.push(`ASSUME trace_${key} \\in Seq(${typ})`);
  }

  lines.push("");
  lines.push("====");

  return lines.join("\n");
}

/**
 * Convert a JSON value to TLA+ syntax.
 *
 * @param {unknown} value
 * @returns {string}
 */
function jsonToTla(value) {
  if (value === null) return `"null"`;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new ValidationError(`Float values not supported in TLA+: ${value}`);
    }
    return String(value);
  }
  if (typeof value === "string") return `"${escapeTlaString(value)}"`;
  if (Array.isArray(value)) {
    return `<<${value.map(jsonToTla).join(", ")}>>`;
  }
  if (typeof value === "object") {
    const obj = /** @type {Record<string, unknown>} */ (value);
    const entries = Object.entries(obj);
    if (entries.length === 0) return `[dummy |-> 0]`; // TLA+ doesn't allow empty records
    return `[${entries.map(([k, v]) => `${k} |-> ${jsonToTla(v)}`).join(", ")}]`;
  }
  return `"${String(value)}"`;
}

/**
 * Escape a string for TLA+ string literals.
 * @param {string} s
 * @returns {string}
 */
function escapeTlaString(s) {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/\r/g, "\\r");
}

/**
 * Infer a Snowcat type annotation from a JS value.
 * @param {unknown} value
 * @returns {string}
 */
function inferTlaType(value) {
  if (value === null) return "Str";
  if (typeof value === "boolean") return "Bool";
  if (typeof value === "number") return "Int";
  if (typeof value === "string") return "Str";
  if (Array.isArray(value)) {
    if (value.length === 0) return "Seq(Int)";
    return `Seq(${inferTlaType(value[0])})`;
  }
  if (typeof value === "object") {
    const obj = /** @type {Record<string, unknown>} */ (value);
    const entries = Object.entries(obj);
    if (entries.length === 0) return "[dummy: Int]";
    return `[${entries.map(([k, v]) => `${k}: ${inferTlaType(v)}`).join(", ")}]`;
  }
  return "Str";
}

/**
 * Validate that a value contains no float numbers.
 * @param {unknown} value
 * @param {number} line
 * @param {string} path
 */
function validateNoFloats(value, line, path) {
  if (typeof value === "number" && !Number.isInteger(value)) {
    throw new ValidationError(`Float value at line ${line}, field "${path}": ${value}. TLA+ uses Int.`);
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      validateNoFloats(value[i], line, `${path}[${i}]`);
    }
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (value))) {
      validateNoFloats(v, line, `${path}.${k}`);
    }
  }
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
      reject(err);
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
