import { test, expect, describe } from "bun:test";
import { StateEmitter } from "../src/emitter.js";
import { ValidationError } from "../src/errors.js";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function makeTempFile() {
  const dir = mkdtempSync(join(tmpdir(), "tla-emitter-test-"));
  const path = join(dir, "trace.ndjson");
  return { dir, path };
}

describe("StateEmitter", () => {
  test("writes NDJSON lines", () => {
    const { dir, path } = makeTempFile();
    try {
      const emitter = new StateEmitter(path);
      emitter.emit("Init", { counter: 0 });
      emitter.emit("Inc", { counter: 1 });
      const count = emitter.finish();

      expect(count).toBe(2);
      const lines = readFileSync(path, "utf-8").trim().split("\n");
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0])).toEqual({ action: "Init", counter: 0 });
      expect(JSON.parse(lines[1])).toEqual({ action: "Inc", counter: 1 });
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("throws on emit after finish", () => {
    const { dir, path } = makeTempFile();
    try {
      const emitter = new StateEmitter(path);
      emitter.emit("Init", { x: 0 });
      emitter.finish();

      expect(() => emitter.emit("Step", { x: 1 })).toThrow(ValidationError);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("throws on non-object state", () => {
    const { dir, path } = makeTempFile();
    try {
      const emitter = new StateEmitter(path);
      expect(() => emitter.emit("Init", /** @type {any} */ ([1, 2]))).toThrow(ValidationError);
      expect(() => emitter.emit("Init", /** @type {any} */ (null))).toThrow(ValidationError);
      expect(() => emitter.emit("Init", /** @type {any} */ ("str"))).toThrow(ValidationError);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("handles special characters in state", () => {
    const { dir, path } = makeTempFile();
    try {
      const emitter = new StateEmitter(path);
      emitter.emit("Init", { msg: 'hello "world"\nnewline' });
      emitter.finish();

      const lines = readFileSync(path, "utf-8").trim().split("\n");
      const parsed = JSON.parse(lines[0]);
      expect(parsed.msg).toBe('hello "world"\nnewline');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("finish returns 0 with no emits", () => {
    const { dir, path } = makeTempFile();
    try {
      const emitter = new StateEmitter(path);
      expect(emitter.finish()).toBe(0);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("handles nested state objects", () => {
    const { dir, path } = makeTempFile();
    try {
      const emitter = new StateEmitter(path);
      emitter.emit("Init", { nested: { a: 1, b: [2, 3] } });
      emitter.finish();

      const lines = readFileSync(path, "utf-8").trim().split("\n");
      const parsed = JSON.parse(lines[0]);
      expect(parsed).toEqual({ action: "Init", nested: { a: 1, b: [2, 3] } });
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
