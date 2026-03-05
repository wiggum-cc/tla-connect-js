// @ts-check

/**
 * State diff utility for human-readable mismatch reporting.
 * @module
 */

/**
 * Produce a human-readable unified diff between two state objects.
 * Shows field-by-field divergence.
 *
 * @param {Record<string, unknown>} expected - spec state
 * @param {Record<string, unknown>} actual   - driver state
 * @returns {string}
 */
export function stateDiff(expected, actual) {
  const allKeys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
  const lines = [];

  for (const key of allKeys) {
    const hasExp = key in expected;
    const hasAct = key in actual;
    const expStr = hasExp ? fmt(expected[key]) : undefined;
    const actStr = hasAct ? fmt(actual[key]) : undefined;

    if (!hasAct) {
      lines.push(`- ${key}: ${expStr}`);
    } else if (!hasExp) {
      lines.push(`+ ${key}: ${actStr}`);
    } else if (expStr !== actStr) {
      lines.push(`- ${key}: ${expStr}`);
      lines.push(`+ ${key}: ${actStr}`);
    } else {
      lines.push(`  ${key}: ${actStr}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format a value for diff display.
 * @param {unknown} v
 * @returns {string}
 */
function fmt(v) {
  if (v === null || v === undefined) return String(v);
  if (typeof v === "bigint") return `${v}n`;
  if (v instanceof Set) return `Set(${[...v].map(fmt).join(", ")})`;
  if (v instanceof Map) return `Map(${[...v].map(([k, val]) => `${fmt(k)} => ${fmt(val)}`).join(", ")})`;
  if (Array.isArray(v)) return `[${v.map(fmt).join(", ")}]`;
  if (typeof v === "object") return JSON.stringify(v);
  return JSON.stringify(v);
}
