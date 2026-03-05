// @ts-check

/**
 * Apalache JSON-RPC client using native fetch.
 * @module
 */

import { makeRequest } from "./types.js";
import { RpcError } from "../errors.js";

/**
 * @typedef {Object} RetryConfig
 * @property {number} [maxRetries=3]
 * @property {number} [initialDelayMs=100]
 * @property {number} [backoffMultiplier=2]
 * @property {number} [maxDelayMs=5000]
 */

/**
 * JSON-RPC 2.0 client for the Apalache server.
 */
export class ApalacheRpcClient {
  /** @type {string} */
  #baseUrl;
  /** @type {number} */
  #nextId = 1;
  /** @type {Required<RetryConfig>} */
  #retry;

  /**
   * @param {string} baseUrl - e.g. "http://localhost:8822"
   * @param {RetryConfig} [retryConfig]
   */
  constructor(baseUrl, retryConfig) {
    this.#baseUrl = baseUrl.replace(/\/$/, "");
    this.#retry = {
      maxRetries: retryConfig?.maxRetries ?? 3,
      initialDelayMs: retryConfig?.initialDelayMs ?? 100,
      backoffMultiplier: retryConfig?.backoffMultiplier ?? 2,
      maxDelayMs: retryConfig?.maxDelayMs ?? 5000,
    };
  }

  /**
   * Send a JSON-RPC request with retry logic.
   *
   * @param {string} method
   * @param {Record<string, unknown>} [params]
   * @returns {Promise<unknown>}
   */
  async #call(method, params) {
    const id = this.#nextId++;
    const body = JSON.stringify(makeRequest(id, method, params));

    let lastError;
    let delay = this.#retry.initialDelayMs;

    for (let attempt = 0; attempt <= this.#retry.maxRetries; attempt++) {
      try {
        const res = await fetch(`${this.#baseUrl}/jsonrpc`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });

        /** @type {import("./types.js").JsonRpcResponse} */
        const json = await res.json();

        if (json.error) {
          throw new RpcError(json.error.message, json.error.code);
        }

        return json.result;
      } catch (err) {
        lastError = err;
        if (err instanceof RpcError) throw err; // don't retry app-level errors
        if (attempt < this.#retry.maxRetries) {
          await new Promise((r) => setTimeout(r, delay));
          delay = Math.min(delay * this.#retry.backoffMultiplier, this.#retry.maxDelayMs);
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new RpcError(String(lastError));
  }

  /**
   * Ping the server.
   * @returns {Promise<boolean>}
   */
  async ping() {
    try {
      await this.#call("ping");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load a TLA+ specification.
   * @param {import("./types.js").SpecParameters} params
   * @returns {Promise<import("./types.js").LoadSpecResult>}
   */
  async loadSpec(params) {
    return /** @type {import("./types.js").LoadSpecResult} */ (
      await this.#call("loadSpec", /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (params)))
    );
  }

  /**
   * Assume a specific transition from the current state.
   * @param {string} specId
   * @param {string} transition
   * @returns {Promise<import("./types.js").AssumeTransitionResult>}
   */
  async assumeTransition(specId, transition) {
    return /** @type {import("./types.js").AssumeTransitionResult} */ (
      await this.#call("assumeTransition", { specId, transition })
    );
  }

  /**
   * Get available next transitions.
   * @param {string} specId
   * @returns {Promise<import("./types.js").NextStepResult>}
   */
  async nextStep(specId) {
    return /** @type {import("./types.js").NextStepResult} */ (
      await this.#call("nextStep", { specId })
    );
  }

  /**
   * Roll back to previous state.
   * @param {string} specId
   * @returns {Promise<import("./types.js").RollbackResult>}
   */
  async rollback(specId) {
    return /** @type {import("./types.js").RollbackResult} */ (
      await this.#call("rollback", { specId })
    );
  }

  /**
   * Assume a state directly.
   * @param {string} specId
   * @param {Record<string, unknown>} state
   * @returns {Promise<import("./types.js").AssumeStateResult>}
   */
  async assumeState(specId, state) {
    return /** @type {import("./types.js").AssumeStateResult} */ (
      await this.#call("assumeState", { specId, state })
    );
  }

  /**
   * Query the current trace state.
   * @param {string} specId
   * @returns {Promise<import("./types.js").QueryResult>}
   */
  async queryTrace(specId) {
    return /** @type {import("./types.js").QueryResult} */ (
      await this.#call("queryTrace", { specId })
    );
  }

  /**
   * Dispose a loaded specification.
   * @param {string} specId
   * @returns {Promise<import("./types.js").DisposeSpecResult>}
   */
  async disposeSpec(specId) {
    return /** @type {import("./types.js").DisposeSpecResult} */ (
      await this.#call("disposeSpec", { specId })
    );
  }
}
