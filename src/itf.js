// @ts-check

/**
 * ITF (Informal Trace Format) JSON decoder.
 *
 * Handles Apalache-specific encodings:
 *   {"#bigint": "42"}  → BigInt or Number
 *   {"#set": [...]}    → Set
 *   {"#tup": [...]}    → Array (tuple)
 *   {"#map": [[k,v]…]} → Map
 *
 * @module
 */

/**
 * Decode a single ITF value to a native JS type.
 * @param {unknown} raw
 * @returns {unknown}
 */
export function decodeItfValue(raw) {
  if (raw === null || raw === undefined) return raw;
  if (typeof raw !== "object") return raw; // bool, string, number

  if (Array.isArray(raw)) {
    return raw.map(decodeItfValue);
  }

  const obj = /** @type {Record<string, unknown>} */ (raw);

  // #bigint → BigInt (or Number if safe integer)
  if ("#bigint" in obj) {
    const n = BigInt(/** @type {string} */ (obj["#bigint"]));
    if (n >= Number.MIN_SAFE_INTEGER && n <= Number.MAX_SAFE_INTEGER) {
      return Number(n);
    }
    return n;
  }

  // #set → Set
  if ("#set" in obj) {
    return new Set(/** @type {unknown[]} */ (obj["#set"]).map(decodeItfValue));
  }

  // #tup → Array
  if ("#tup" in obj) {
    return /** @type {unknown[]} */ (obj["#tup"]).map(decodeItfValue);
  }

  // #map → Map
  if ("#map" in obj) {
    const entries = /** @type {[unknown, unknown][]} */ (obj["#map"]);
    return new Map(entries.map(([k, v]) => [decodeItfValue(k), decodeItfValue(v)]));
  }

  // Plain record – recurse
  /** @type {Record<string, unknown>} */
  const decoded = {};
  for (const [key, val] of Object.entries(obj)) {
    decoded[key] = decodeItfValue(val);
  }
  return decoded;
}

/**
 * @typedef {Object} ItfState
 * @property {number} index
 * @property {string} edge
 * @property {Record<string, unknown>} values
 */

/**
 * @typedef {Object} ItfTrace
 * @property {Record<string, unknown>} meta
 * @property {string[]} vars
 * @property {ItfState[]} states
 */

/**
 * Parse a full ITF trace JSON string.
 * @param {string} json
 * @returns {ItfTrace}
 */
export function parseItfTrace(json) {
  const raw = JSON.parse(json);
  const meta = raw["#meta"] ?? {};
  const vars = raw.vars ?? [];
  const states = (raw.states ?? []).map((/** @type {Record<string, unknown>} */ s, /** @type {number} */ i) => {
    const stateMeta = /** @type {Record<string, unknown>} */ (s["#meta"]) ?? {};
    const index = typeof stateMeta.index === "number" ? stateMeta.index : i;

    // Decode all values except #meta
    /** @type {Record<string, unknown>} */
    const values = {};
    for (const [key, val] of Object.entries(s)) {
      if (key === "#meta") continue;
      values[key] = decodeItfValue(val);
    }

    const edge = typeof values.edge === "string" ? values.edge : (i === 0 ? "Init" : "unknown");

    return { index, edge, values };
  });

  return { meta, vars, states };
}
