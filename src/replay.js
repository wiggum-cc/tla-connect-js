// @ts-check

/**
 * Trace replay engine – replays Apalache ITF traces against a JS Driver.
 * @module
 */

import { stateDiff } from "./diff.js";

/**
 * @typedef {Object} Step
 * @property {string} action  - the edge/action name
 * @property {Record<string, unknown>} state – full decoded TLA+ state
 * @property {number} index   – state index in trace
 */

/**
 * @typedef {Object} Driver
 * @property {(step: Step) => void} step          - execute one action
 * @property {() => Record<string, unknown>} extractState - return current impl state
 */

/**
 * Error thrown when spec state diverges from implementation state.
 */
export class StateMismatchError extends Error {
  /**
   * @param {Object} info
   * @param {number} info.traceIndex
   * @param {number} info.stateIndex
   * @param {string} info.action
   * @param {Record<string, unknown>} info.expected
   * @param {Record<string, unknown>} info.actual
   * @param {string} info.diff
   */
  constructor({ traceIndex, stateIndex, action, expected, actual, diff }) {
    super(
      `State mismatch at trace[${traceIndex}] state[${stateIndex}] after "${action}":\n${diff}`
    );
    this.name = "StateMismatchError";
    this.traceIndex = traceIndex;
    this.stateIndex = stateIndex;
    this.action = action;
    this.expected = expected;
    this.actual = actual;
    this.diff = diff;
  }
}

/**
 * Compare implementation state against spec state.
 * Only keys present in implState are compared (projection).
 *
 * @param {Record<string, unknown>} specState
 * @param {Record<string, unknown>} implState
 * @returns {boolean}
 */
function statesMatch(specState, implState) {
  for (const key of Object.keys(implState)) {
    if (!(key in specState)) return false;
    if (!valueEquals(specState[key], implState[key])) return false;
  }
  return true;
}

/**
 * Deep equality for decoded ITF values.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function valueEquals(a, b) {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a === "bigint") return a === b;

  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    // For sets of primitives; for complex values this is best-effort
    const aArr = [...a].map((v) => JSON.stringify(v)).sort();
    const bArr = [...b].map((v) => JSON.stringify(v)).sort();
    return aArr.every((v, i) => v === bArr[i]);
  }

  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) {
      if (!b.has(k) || !valueEquals(v, b.get(k))) return false;
    }
    return true;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => valueEquals(v, b[i]));
  }

  if (typeof a === "object" && typeof b === "object") {
    const aObj = /** @type {Record<string, unknown>} */ (a);
    const bObj = /** @type {Record<string, unknown>} */ (b);
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) => k in bObj && valueEquals(aObj[k], bObj[k]));
  }

  return false;
}

/**
 * Project spec state to only include keys from implState.
 * @param {Record<string, unknown>} specState
 * @param {string[]} keys
 * @returns {Record<string, unknown>}
 */
function projectState(specState, keys) {
  /** @type {Record<string, unknown>} */
  const projected = {};
  for (const key of keys) {
    if (key in specState) {
      projected[key] = specState[key];
    }
  }
  return projected;
}

/**
 * Replay a single parsed trace against a driver.
 *
 * @param {() => Driver} driverFactory
 * @param {import("./itf.js").ItfTrace} trace
 * @param {number} [traceIndex=0]
 * @returns {{ states: number, duration: number }}
 */
export function replayTrace(driverFactory, trace, traceIndex = 0) {
  const start = performance.now();
  const driver = driverFactory();

  for (const state of trace.states) {
    const action = state.edge;
    driver.step({ action, state: state.values, index: state.index });

    const implState = driver.extractState();
    const implKeys = Object.keys(implState);
    const projected = projectState(state.values, implKeys);

    if (!statesMatch(state.values, implState)) {
      const diff = stateDiff(projected, implState);
      throw new StateMismatchError({
        traceIndex,
        stateIndex: state.index,
        action,
        expected: projected,
        actual: implState,
        diff,
      });
    }
  }

  return { states: trace.states.length, duration: performance.now() - start };
}

/**
 * Replay all traces, returns aggregate stats.
 *
 * @param {() => Driver} driverFactory
 * @param {import("./itf.js").ItfTrace[]} traces
 * @returns {{ traces: number, states: number, duration: number }}
 */
export function replayTraces(driverFactory, traces) {
  const start = performance.now();
  let totalStates = 0;

  for (let i = 0; i < traces.length; i++) {
    const result = replayTrace(driverFactory, traces[i], i);
    totalStates += result.states;
  }

  return {
    traces: traces.length,
    states: totalStates,
    duration: performance.now() - start,
  };
}
