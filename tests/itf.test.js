import { test, expect, describe } from "bun:test";
import { decodeItfValue, parseItfTrace } from "../src/itf.js";

describe("decodeItfValue", () => {
  test("#bigint → Number for safe integers", () => {
    expect(decodeItfValue({ "#bigint": "42" })).toBe(42);
    expect(decodeItfValue({ "#bigint": "0" })).toBe(0);
    expect(decodeItfValue({ "#bigint": "-7" })).toBe(-7);
  });

  test("#bigint → BigInt for unsafe integers", () => {
    const big = "9007199254740993"; // Number.MAX_SAFE_INTEGER + 2
    expect(decodeItfValue({ "#bigint": big })).toBe(9007199254740993n);
  });

  test("#set → Set", () => {
    const result = decodeItfValue({ "#set": [1, 2, 3] });
    expect(result).toBeInstanceOf(Set);
    expect(result).toEqual(new Set([1, 2, 3]));
  });

  test("#set with nested #bigint", () => {
    const result = decodeItfValue({ "#set": [{ "#bigint": "10" }, { "#bigint": "20" }] });
    expect(result).toEqual(new Set([10, 20]));
  });

  test("#tup → Array", () => {
    const result = decodeItfValue({ "#tup": [1, "hello", true] });
    expect(result).toEqual([1, "hello", true]);
  });

  test("#map → Map", () => {
    const result = decodeItfValue({ "#map": [["a", 1], ["b", 2]] });
    expect(result).toBeInstanceOf(Map);
    expect(result).toEqual(new Map([["a", 1], ["b", 2]]));
  });

  test("#map with nested values", () => {
    const result = decodeItfValue({
      "#map": [
        ["key", { "#bigint": "100" }],
        ["other", { "#set": [1, 2] }],
      ],
    });
    expect(result.get("key")).toBe(100);
    expect(result.get("other")).toEqual(new Set([1, 2]));
  });

  test("booleans pass through", () => {
    expect(decodeItfValue(true)).toBe(true);
    expect(decodeItfValue(false)).toBe(false);
  });

  test("strings pass through", () => {
    expect(decodeItfValue("hello")).toBe("hello");
  });

  test("numbers pass through", () => {
    expect(decodeItfValue(42)).toBe(42);
  });

  test("null/undefined pass through", () => {
    expect(decodeItfValue(null)).toBe(null);
    expect(decodeItfValue(undefined)).toBe(undefined);
  });

  test("nested records decoded recursively", () => {
    const result = decodeItfValue({
      count: { "#bigint": "5" },
      items: { "#set": ["a", "b"] },
      name: "test",
    });
    expect(result).toEqual({
      count: 5,
      items: new Set(["a", "b"]),
      name: "test",
    });
  });

  test("arrays decoded recursively", () => {
    const result = decodeItfValue([{ "#bigint": "1" }, { "#bigint": "2" }]);
    expect(result).toEqual([1, 2]);
  });
});

describe("parseItfTrace", () => {
  test("parses minimal trace", () => {
    const json = JSON.stringify({
      "#meta": { format: "ITF" },
      vars: ["counter"],
      states: [
        { "#meta": { index: 0 }, counter: { "#bigint": "0" }, edge: "Init" },
        { "#meta": { index: 1 }, counter: { "#bigint": "5" }, edge: "Increment" },
      ],
    });

    const trace = parseItfTrace(json);
    expect(trace.meta.format).toBe("ITF");
    expect(trace.vars).toEqual(["counter"]);
    expect(trace.states).toHaveLength(2);

    expect(trace.states[0].index).toBe(0);
    expect(trace.states[0].edge).toBe("Init");
    expect(trace.states[0].values.counter).toBe(0);

    expect(trace.states[1].index).toBe(1);
    expect(trace.states[1].edge).toBe("Increment");
    expect(trace.states[1].values.counter).toBe(5);
  });

  test("extracts edge from state values", () => {
    const json = JSON.stringify({
      "#meta": {},
      vars: ["state", "edge"],
      states: [
        { "#meta": { index: 0 }, state: "idle", edge: "Init" },
        { "#meta": { index: 1 }, state: "open", edge: "Idle_Open" },
      ],
    });

    const trace = parseItfTrace(json);
    expect(trace.states[0].edge).toBe("Init");
    expect(trace.states[1].edge).toBe("Idle_Open");
  });

  test("defaults edge to Init for index 0", () => {
    const json = JSON.stringify({
      "#meta": {},
      vars: ["counter"],
      states: [{ "#meta": { index: 0 }, counter: 0 }],
    });

    const trace = parseItfTrace(json);
    expect(trace.states[0].edge).toBe("Init");
  });

  test("parses real Apalache output format", () => {
    const json = JSON.stringify({
      "#meta": {
        format: "ITF",
        varTypes: { state: "Str", edge: "Str", inflightCount: "Int" },
        "format-description": "https://apalache-mc.org/docs/adr/015adr-trace.html",
      },
      vars: ["state", "edge", "inflightCount"],
      states: [
        {
          "#meta": { index: 0 },
          state: "idle",
          edge: "Init",
          inflightCount: { "#bigint": "0" },
        },
        {
          "#meta": { index: 1 },
          state: "loading",
          edge: "Step_Request",
          inflightCount: { "#bigint": "1" },
        },
      ],
    });

    const trace = parseItfTrace(json);
    expect(trace.states[0].values.inflightCount).toBe(0);
    expect(trace.states[1].values.inflightCount).toBe(1);
    expect(trace.states[1].edge).toBe("Step_Request");
  });

  test("#meta is excluded from state values", () => {
    const json = JSON.stringify({
      "#meta": {},
      vars: ["x"],
      states: [{ "#meta": { index: 0 }, x: 1, edge: "Init" }],
    });

    const trace = parseItfTrace(json);
    expect(trace.states[0].values["#meta"]).toBeUndefined();
    expect(trace.states[0].values.x).toBe(1);
  });
});
