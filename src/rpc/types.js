// @ts-check

/**
 * JSON-RPC 2.0 types and helpers for Apalache server communication.
 * @module
 */

/**
 * @typedef {Object} JsonRpcRequest
 * @property {"2.0"} jsonrpc
 * @property {number} id
 * @property {string} method
 * @property {Record<string, unknown>} [params]
 */

/**
 * @typedef {Object} JsonRpcError
 * @property {number} code
 * @property {string} message
 * @property {unknown} [data]
 */

/**
 * @typedef {Object} JsonRpcResponse
 * @property {"2.0"} jsonrpc
 * @property {number} id
 * @property {unknown} [result]
 * @property {JsonRpcError} [error]
 */

/**
 * @typedef {Object} LoadSpecResult
 * @property {string} specId
 */

/**
 * @typedef {Object} SpecParameters
 * @property {string} spec       - base64-encoded TLA+ spec
 * @property {string[]} auxFiles - base64-encoded auxiliary files
 * @property {string} init       - init predicate name
 * @property {string} next       - next-state relation name
 * @property {Record<string, string>} [constants] - CONSTANT overrides
 */

/**
 * @typedef {Object} Transition
 * @property {string} name
 * @property {Record<string, unknown>} [params]
 */

/**
 * @typedef {Object} AssumeTransitionResult
 * @property {boolean} applied
 * @property {Record<string, unknown>} state
 */

/**
 * @typedef {Object} NextStepResult
 * @property {Transition[]} transitions
 */

/**
 * @typedef {Object} RollbackResult
 * @property {boolean} success
 */

/**
 * @typedef {Object} AssumeStateResult
 * @property {boolean} applied
 */

/**
 * @typedef {Object} QueryResult
 * @property {Record<string, unknown>} state
 */

/**
 * @typedef {Object} DisposeSpecResult
 * @property {boolean} disposed
 */

/**
 * Create a JSON-RPC 2.0 request object.
 *
 * @param {number} id
 * @param {string} method
 * @param {Record<string, unknown>} [params]
 * @returns {JsonRpcRequest}
 */
export function makeRequest(id, method, params) {
  /** @type {JsonRpcRequest} */
  const req = { jsonrpc: "2.0", id, method };
  if (params !== undefined) req.params = params;
  return req;
}
