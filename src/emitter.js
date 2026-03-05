// @ts-check

/**
 * Approach 3, part 1: StateEmitter – synchronous NDJSON state writer.
 * @module
 */

import { appendFileSync } from "node:fs";
import { ValidationError } from "./errors.js";

/**
 * Synchronous state emitter that writes NDJSON lines to a file.
 * Each line is `{"action":"...", ...state}\n`.
 */
export class StateEmitter {
  /** @type {string} */
  #path;
  /** @type {number} */
  #count = 0;
  /** @type {boolean} */
  #finished = false;

  /**
   * @param {string} filePath - path to NDJSON output file
   */
  constructor(filePath) {
    this.#path = filePath;
  }

  /**
   * Emit a state transition as an NDJSON line.
   *
   * @param {string} action - the action/transition name
   * @param {Record<string, unknown>} state - the state object
   */
  emit(action, state) {
    if (this.#finished) {
      throw new ValidationError("Cannot emit after finish()");
    }
    if (state === null || typeof state !== "object" || Array.isArray(state)) {
      throw new ValidationError("State must be a plain object");
    }
    const line = JSON.stringify({ action, ...state }) + "\n";
    appendFileSync(this.#path, line, "utf-8");
    this.#count++;
  }

  /**
   * Finish emitting. Returns the number of lines written.
   * No further calls to emit() are allowed.
   *
   * @returns {number}
   */
  finish() {
    this.#finished = true;
    return this.#count;
  }
}
