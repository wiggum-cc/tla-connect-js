// @ts-check

/**
 * Trace replay engine – replays Apalache ITF traces against a JS Driver.
 * @module
 */

import { stateDiff } from "./diff.js";
import { statesMatch, projectState } from "./_compare.js";
import { parseItfTrace } from "./itf.js";

/**
 * @typedef {Object} Step
 * @property {string} action  - the edge/action name
 * @property {Record<string, unknown>} state – full decoded TLA+ state
 * @property {number} index   – state index in trace
 * @property {Record<string, unknown>} [nondetPicks] - nondeterministic choices
 */

/**
 * @typedef {Object} Driver
 * @property {(step: Step) => void} step          - execute one action
 * @property {() => Record<string, unknown>} extractState - return current impl state
 */

/**
 * @typedef {Object} ReplayProgress
 * @property {number} traceIndex
 * @property {number} traceCount
 * @property {number} statesCompleted
 * @property {number} statesTotal
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
    const action = state.action ?? state.edge;
    /** @type {Step} */
    const step = { action, state: state.values, index: state.index };
    if (state.nondetPicks) step.nondetPicks = state.nondetPicks;
    driver.step(step);

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

/**
 * Replay all traces with progress callback.
 *
 * @param {() => Driver} driverFactory
 * @param {import("./itf.js").ItfTrace[]} traces
 * @param {(progress: ReplayProgress) => void} progressFn
 * @returns {{ traces: number, states: number, duration: number }}
 */
export function replayTracesWithProgress(driverFactory, traces, progressFn) {
  const start = performance.now();
  let totalStates = 0;
  const totalStatesAll = traces.reduce((sum, t) => sum + t.states.length, 0);

  for (let i = 0; i < traces.length; i++) {
    progressFn({
      traceIndex: i,
      traceCount: traces.length,
      statesCompleted: totalStates,
      statesTotal: totalStatesAll,
    });
    const result = replayTrace(driverFactory, traces[i], i);
    totalStates += result.states;
  }

  progressFn({
    traceIndex: traces.length,
    traceCount: traces.length,
    statesCompleted: totalStates,
    statesTotal: totalStatesAll,
  });

  return {
    traces: traces.length,
    states: totalStates,
    duration: performance.now() - start,
  };
}

/**
 * Parse an ITF JSON string and replay against a driver in one call.
 *
 * @param {() => Driver} driverFactory
 * @param {string} json - ITF trace JSON string
 * @param {number} [traceIndex=0]
 * @returns {{ states: number, duration: number }}
 */
export function replayTraceStr(driverFactory, json, traceIndex = 0) {
  const trace = parseItfTrace(json);
  return replayTrace(driverFactory, trace, traceIndex);
}
