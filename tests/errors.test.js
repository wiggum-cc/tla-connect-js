import { test, expect, describe } from "bun:test";
import { StepError, TraceGenError, ValidationError, RpcError } from "../src/errors.js";

describe("StepError", () => {
  test("replay context", () => {
    const ctx = { kind: "replay", trace: 2, state: 5 };
    const err = new StepError("mismatch", ctx, "Inc", { x: 1 }, { x: 2 }, "- x: 1\n+ x: 2");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(StepError);
    expect(err.name).toBe("StepError");
    expect(err.message).toBe("mismatch");
    expect(err.context).toEqual({ kind: "replay", trace: 2, state: 5 });
    expect(err.action).toBe("Inc");
    expect(err.expected).toEqual({ x: 1 });
    expect(err.actual).toEqual({ x: 2 });
    expect(err.diff).toContain("x: 1");
  });

  test("rpc context", () => {
    const ctx = { kind: "rpc", run: 0, step: 3 };
    const err = new StepError("fail", ctx, "Step", {}, {}, "");
    expect(err.context.kind).toBe("rpc");
    expect(err.context).toEqual({ kind: "rpc", run: 0, step: 3 });
  });
});

describe("TraceGenError", () => {
  test("with exit code and output", () => {
    const err = new TraceGenError("apalache failed", 1, "out", "err");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TraceGenError);
    expect(err.name).toBe("TraceGenError");
    expect(err.exitCode).toBe(1);
    expect(err.stdout).toBe("out");
    expect(err.stderr).toBe("err");
  });

  test("without optional fields", () => {
    const err = new TraceGenError("timeout");
    expect(err.exitCode).toBeUndefined();
    expect(err.stdout).toBeUndefined();
    expect(err.stderr).toBeUndefined();
  });
});

describe("ValidationError", () => {
  test("with reason", () => {
    const err = new ValidationError("invalid trace", "schema mismatch at line 3");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.name).toBe("ValidationError");
    expect(err.reason).toBe("schema mismatch at line 3");
  });

  test("without reason", () => {
    const err = new ValidationError("bad");
    expect(err.reason).toBeUndefined();
  });
});

describe("RpcError", () => {
  test("with code", () => {
    const err = new RpcError("method not found", -32601);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(RpcError);
    expect(err.name).toBe("RpcError");
    expect(err.code).toBe(-32601);
  });

  test("without code", () => {
    const err = new RpcError("connection refused");
    expect(err.code).toBeUndefined();
  });
});
