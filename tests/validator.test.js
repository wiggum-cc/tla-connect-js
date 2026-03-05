import { test, expect, describe } from "bun:test";
import { ndjsonToTlaModule } from "../src/validator.js";
import { ValidationError } from "../src/errors.js";

describe("ndjsonToTlaModule", () => {
  test("generates module for simple integer trace", () => {
    const objects = [
      { action: "Init", counter: 0 },
      { action: "Inc", counter: 1 },
      { action: "Inc", counter: 2 },
    ];

    const result = ndjsonToTlaModule(objects);
    expect(result).toContain("---- MODULE TraceData ----");
    expect(result).toContain("TraceLen == 3");
    expect(result).toContain("trace_action == <<");
    expect(result).toContain("trace_counter == <<0, 1, 2>>");
    expect(result).toContain("====");
  });

  test("handles string values", () => {
    const objects = [
      { action: "Init", state: "idle" },
      { action: "Start", state: "running" },
    ];

    const result = ndjsonToTlaModule(objects);
    expect(result).toContain('"idle"');
    expect(result).toContain('"running"');
  });

  test("handles boolean values", () => {
    const objects = [
      { action: "Init", flag: true },
      { action: "Toggle", flag: false },
    ];

    const result = ndjsonToTlaModule(objects);
    expect(result).toContain("TRUE");
    expect(result).toContain("FALSE");
  });

  test("handles null as string", () => {
    const objects = [
      { action: "Init", val: null },
    ];

    const result = ndjsonToTlaModule(objects);
    expect(result).toContain('"null"');
  });

  test("handles arrays as sequences", () => {
    const objects = [
      { action: "Init", items: [1, 2, 3] },
    ];

    const result = ndjsonToTlaModule(objects);
    expect(result).toContain("<<1, 2, 3>>");
  });

  test("handles nested objects as records", () => {
    const objects = [
      { action: "Init", config: { x: 1, y: 2 } },
    ];

    const result = ndjsonToTlaModule(objects);
    expect(result).toContain("[x |-> 1, y |-> 2]");
  });

  test("throws on schema inconsistency", () => {
    const objects = [
      { action: "Init", counter: 0 },
      { action: "Inc", counter: 1, extra: true },
    ];

    expect(() => ndjsonToTlaModule(objects)).toThrow(ValidationError);
  });

  test("throws on empty trace", () => {
    expect(() => ndjsonToTlaModule([])).toThrow(ValidationError);
  });

  test("throws on float values", () => {
    const objects = [
      { action: "Init", val: 3.14 },
    ];

    expect(() => ndjsonToTlaModule(objects)).toThrow(ValidationError);
  });

  test("throws on nested float values", () => {
    const objects = [
      { action: "Init", nested: { val: 1.5 } },
    ];

    expect(() => ndjsonToTlaModule(objects)).toThrow(ValidationError);
  });

  test("type inference for Snowcat annotations", () => {
    const objects = [
      { action: "Init", counter: 0, flag: true, name: "test" },
    ];

    const result = ndjsonToTlaModule(objects);
    expect(result).toContain("Seq(Str)");
    expect(result).toContain("Seq(Int)");
    expect(result).toContain("Seq(Bool)");
  });

  test("escapes special characters in strings", () => {
    const objects = [
      { action: "Init", msg: 'hello "world"' },
    ];

    const result = ndjsonToTlaModule(objects);
    expect(result).toContain('\\"world\\"');
  });

  test("escapes backslashes", () => {
    const objects = [
      { action: "Init", path: "a\\b" },
    ];

    const result = ndjsonToTlaModule(objects);
    expect(result).toContain("a\\\\b");
  });

  test("escapes newlines", () => {
    const objects = [
      { action: "Init", text: "line1\nline2" },
    ];

    const result = ndjsonToTlaModule(objects);
    expect(result).toContain("line1\\nline2");
  });
});
