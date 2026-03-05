// @ts-check

/**
 * File system loader for ITF trace files.
 * @module
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseItfTrace } from "./itf.js";

/**
 * Load and parse a single .itf.json file.
 * @param {string} filePath
 * @returns {import("./itf.js").ItfTrace}
 */
export function loadTrace(filePath) {
  const content = readFileSync(filePath, "utf-8");
  return parseItfTrace(content);
}

/**
 * Recursively find all *.itf.json files in a directory, parse each,
 * and return an array sorted by file path.
 *
 * @param {string} dirPath
 * @param {Object} [options]
 * @param {string} [options.glob] - glob pattern filter (unused, reserved for future)
 * @returns {import("./itf.js").ItfTrace[]}
 */
export function loadTracesFromDir(dirPath, options) {
  const paths = collectItfFiles(dirPath);
  paths.sort();
  return paths.map(loadTrace);
}

/**
 * Recursively collect all .itf.json file paths.
 * @param {string} dir
 * @returns {string[]}
 */
function collectItfFiles(dir) {
  /** @type {string[]} */
  const result = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      result.push(...collectItfFiles(full));
    } else if (entry.endsWith(".itf.json")) {
      result.push(full);
    }
  }

  return result;
}
