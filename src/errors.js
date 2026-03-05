// @ts-check

/**
 * Structured error types for tla-connect.
 * @module
 */

/**
 * @typedef {{ kind: "replay", trace: number, state: number }} ReplayContext
 * @typedef {{ kind: "rpc", run: number, step: number }} RpcContext
 * @typedef {ReplayContext | RpcContext} StepContext
 */

/**
 * Error thrown when a single step fails (state mismatch).
 * Carries context about where in the test the failure occurred.
 */
export class StepError extends Error {
  /**
   * @param {string} message
   * @param {StepContext} context
   * @param {string} action
   * @param {Record<string, unknown>} expected
   * @param {Record<string, unknown>} actual
   * @param {string} diff
   */
  constructor(message, context, action, expected, actual, diff) {
    super(message);
    this.name = "StepError";
    /** @type {StepContext} */
    this.context = context;
    /** @type {string} */
    this.action = action;
    /** @type {Record<string, unknown>} */
    this.expected = expected;
    /** @type {Record<string, unknown>} */
    this.actual = actual;
    /** @type {string} */
    this.diff = diff;
  }
}

/**
 * Error thrown when Apalache trace generation fails.
 */
export class TraceGenError extends Error {
  /**
   * @param {string} message
   * @param {number | null} [exitCode]
   * @param {string} [stdout]
   * @param {string} [stderr]
   */
  constructor(message, exitCode, stdout, stderr) {
    super(message);
    this.name = "TraceGenError";
    /** @type {number | null | undefined} */
    this.exitCode = exitCode;
    /** @type {string | undefined} */
    this.stdout = stdout;
    /** @type {string | undefined} */
    this.stderr = stderr;
  }
}

/**
 * Error thrown when trace validation fails.
 */
export class ValidationError extends Error {
  /**
   * @param {string} message
   * @param {string} [reason]
   */
  constructor(message, reason) {
    super(message);
    this.name = "ValidationError";
    /** @type {string | undefined} */
    this.reason = reason;
  }
}

/**
 * Error thrown for JSON-RPC communication failures.
 */
export class RpcError extends Error {
  /**
   * @param {string} message
   * @param {number} [code]
   */
  constructor(message, code) {
    super(message);
    this.name = "RpcError";
    /** @type {number | undefined} */
    this.code = code;
  }
}
