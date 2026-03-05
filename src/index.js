// @ts-check

/**
 * tla-connect – Apalache ITF model-based testing for JS.
 * @module
 */

// Type re-exports
/** @typedef {import("./replay.js").Driver} Driver */
/** @typedef {import("./replay.js").Step} Step */
/** @typedef {import("./replay.js").ReplayProgress} ReplayProgress */
/** @typedef {import("./itf.js").ItfTrace} ItfTrace */
/** @typedef {import("./itf.js").ItfState} ItfState */
/** @typedef {import("./apalache.js").ApalacheConfig} ApalacheConfig */
/** @typedef {import("./interactive.js").InteractiveConfig} InteractiveConfig */
/** @typedef {import("./interactive.js").InteractiveStats} InteractiveStats */
/** @typedef {import("./interactive.js").InteractiveProgress} InteractiveProgress */
/** @typedef {import("./validator.js").TraceValidatorConfig} TraceValidatorConfig */
/** @typedef {import("./rpc/client.js").RetryConfig} RetryConfig */
/** @typedef {import("./errors.js").StepContext} StepContext */
/** @typedef {import("./errors.js").ReplayContext} ReplayContext */
/** @typedef {import("./errors.js").RpcContext} RpcContext */

// Errors
export { StepError, TraceGenError, ValidationError, RpcError } from "./errors.js";

// ITF parsing
export { decodeItfValue, parseItfTrace } from "./itf.js";

// Approach 1: Batch trace replay
export { replayTrace, replayTraces, replayTracesWithProgress, replayTraceStr, StateMismatchError } from "./replay.js";

// File loading
export { loadTrace, loadTracesFromDir } from "./loader.js";

// Trace generation
export { generateTraces } from "./apalache.js";

// Approach 2: Interactive symbolic testing
export { interactiveTest, interactiveTestWithProgress } from "./interactive.js";

// RPC client
export { ApalacheRpcClient } from "./rpc/client.js";
export { makeRequest } from "./rpc/types.js";

// Approach 3: Emitter + Validator
export { StateEmitter } from "./emitter.js";
export { validateTrace, ndjsonToTlaModule } from "./validator.js";

// Comparison utilities
export { valueEquals, statesMatch, projectState } from "./_compare.js";

// Diff
export { stateDiff } from "./diff.js";
