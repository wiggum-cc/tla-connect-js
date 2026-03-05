// @ts-check

/**
 * tla-connect – Apalache ITF model-based testing for JS.
 * @module
 */

/** @typedef {import("./replay.js").Driver} Driver */
/** @typedef {import("./replay.js").Step} Step */
/** @typedef {import("./itf.js").ItfTrace} ItfTrace */
/** @typedef {import("./itf.js").ItfState} ItfState */
/** @typedef {import("./apalache.js").ApalacheConfig} ApalacheConfig */

export { decodeItfValue, parseItfTrace } from "./itf.js";
export { replayTrace, replayTraces, StateMismatchError } from "./replay.js";
export { loadTrace, loadTracesFromDir } from "./loader.js";
export { generateTraces } from "./apalache.js";
export { stateDiff } from "./diff.js";
