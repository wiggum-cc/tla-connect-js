// @ts-check

/**
 * Shared comparison utilities for state matching.
 * @module
 */

/**
 * Deep equality for decoded ITF values.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function valueEquals(a, b) {
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
 * Compare implementation state against spec state.
 * Only keys present in implState are compared (projection).
 *
 * @param {Record<string, unknown>} specState
 * @param {Record<string, unknown>} implState
 * @returns {boolean}
 */
export function statesMatch(specState, implState) {
  for (const key of Object.keys(implState)) {
    if (!(key in specState)) return false;
    if (!valueEquals(specState[key], implState[key])) return false;
  }
  return true;
}

/**
 * Project spec state to only include keys from implState.
 * @param {Record<string, unknown>} specState
 * @param {string[]} keys
 * @returns {Record<string, unknown>}
 */
export function projectState(specState, keys) {
  /** @type {Record<string, unknown>} */
  const projected = {};
  for (const key of keys) {
    if (key in specState) {
      projected[key] = specState[key];
    }
  }
  return projected;
}
