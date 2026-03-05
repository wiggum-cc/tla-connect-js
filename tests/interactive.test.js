import { test, expect, describe } from "bun:test";
import { interactiveTest, interactiveTestWithProgress } from "../src/interactive.js";
import { StepError } from "../src/errors.js";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Create a mock RPC client that simulates a simple counter spec.
 * init → counter=0, next → Inc (counter+1)
 */
function mockClient({ maxTransitions = 3, deadlockAfter = Infinity } = {}) {
  let counter = 0;
  let stepCount = 0;
  let disposed = false;

  return {
    async loadSpec(_params) {
      counter = 0;
      stepCount = 0;
      disposed = false;
      return { specId: "mock-spec" };
    },
    async assumeTransition(_specId, transition) {
      if (transition === "Init") {
        counter = 0;
        return { applied: true, state: { counter } };
      }
      if (transition === "Inc" && stepCount < maxTransitions) {
        counter++;
        stepCount++;
        return { applied: true, state: { counter } };
      }
      return { applied: false, state: {} };
    },
    async nextStep(_specId) {
      if (stepCount >= deadlockAfter) {
        return { transitions: [] };
      }
      return { transitions: [{ name: "Inc" }] };
    },
    async rollback(_specId) {
      return { success: true };
    },
    async assumeState(_specId, _state) {
      return { applied: true };
    },
    async queryTrace(_specId) {
      return { state: { counter } };
    },
    async disposeSpec(_specId) {
      disposed = true;
      return { disposed: true };
    },
    get _disposed() { return disposed; },
  };
}

/** Create a temp dir with a dummy .tla spec file */
function makeTempSpec() {
  const dir = mkdtempSync(join(tmpdir(), "tla-interactive-test-"));
  const specPath = join(dir, "Counter.tla");
  writeFileSync(specPath, "---- MODULE Counter ----\nINIT == counter = 0\nNEXT == counter' = counter + 1\n====");
  return { dir, specPath };
}

describe("interactiveTest", () => {
  test("single run with counter spec", async () => {
    const client = mockClient({ maxTransitions: 5 });
    const { dir, specPath } = makeTempSpec();

    try {
      const factory = () => {
        let counter = 0;
        return {
          step({ action }) {
            if (action === "Init") counter = 0;
            else if (action === "Inc") counter++;
          },
          extractState() {
            return { counter };
          },
        };
      };

      const stats = await interactiveTest(factory, client, {
        spec: specPath,
        init: "Init",
        next: "Next",
        maxSteps: 3,
        numRuns: 1,
      });

      expect(stats.runsCompleted).toBe(1);
      expect(stats.totalSteps).toBeGreaterThanOrEqual(1);
      expect(stats.deadlocksHit).toBe(0);
      expect(stats.duration).toBeGreaterThanOrEqual(0);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("multiple runs", async () => {
    const { dir, specPath } = makeTempSpec();

    try {
      const factory = () => {
        let counter = 0;
        return {
          step({ action }) {
            if (action === "Init") counter = 0;
            else counter++;
          },
          extractState() {
            return { counter };
          },
        };
      };

      const client = mockClient({ maxTransitions: 100 });
      const stats = await interactiveTest(factory, client, {
        spec: specPath,
        init: "Init",
        next: "Next",
        maxSteps: 2,
        numRuns: 3,
      });

      expect(stats.runsCompleted).toBe(3);
      // Each run: 1 init + 2 steps = 3, times 3 runs = 9
      expect(stats.totalSteps).toBe(9);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("detects deadlock", async () => {
    const client = mockClient({ deadlockAfter: 0 });
    const { dir, specPath } = makeTempSpec();

    try {
      const factory = () => {
        let counter = 0;
        return {
          step({ action }) {
            if (action === "Init") counter = 0;
            else counter++;
          },
          extractState() {
            return { counter };
          },
        };
      };

      const stats = await interactiveTest(factory, client, {
        spec: specPath,
        init: "Init",
        next: "Next",
        maxSteps: 5,
        numRuns: 1,
      });

      expect(stats.deadlocksHit).toBe(1);
      expect(stats.totalSteps).toBe(1); // only init step
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("state mismatch throws StepError", async () => {
    const client = mockClient({ maxTransitions: 5 });
    const { dir, specPath } = makeTempSpec();

    try {
      // Driver always returns wrong state
      const factory = () => ({
        step() {},
        extractState() {
          return { counter: 999 };
        },
      });

      await expect(
        interactiveTest(factory, client, {
          spec: specPath,
          init: "Init",
          next: "Next",
          maxSteps: 3,
          numRuns: 1,
        })
      ).rejects.toThrow(StepError);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("disposes spec even on error", async () => {
    const client = mockClient({ maxTransitions: 5 });
    const { dir, specPath } = makeTempSpec();

    try {
      const factory = () => ({
        step() {},
        extractState() {
          return { counter: 999 };
        },
      });

      try {
        await interactiveTest(factory, client, {
          spec: specPath,
          init: "Init",
          next: "Next",
          numRuns: 1,
        });
      } catch {
        // expected
      }

      expect(client._disposed).toBe(true);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

describe("interactiveTestWithProgress", () => {
  test("calls progress callback", async () => {
    const client = mockClient({ maxTransitions: 2 });
    const { dir, specPath } = makeTempSpec();

    try {
      const factory = () => {
        let counter = 0;
        return {
          step({ action }) {
            if (action === "Init") counter = 0;
            else counter++;
          },
          extractState() {
            return { counter };
          },
        };
      };

      const events = [];
      await interactiveTestWithProgress(factory, client, {
        spec: specPath,
        init: "Init",
        next: "Next",
        maxSteps: 2,
        numRuns: 1,
      }, (p) => events.push({ ...p }));

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].run).toBe(0);
      expect(events[0].numRuns).toBe(1);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

describe("seed determinism", () => {
  test("same seed produces same exploration order", async () => {
    const { dir, specPath } = makeTempSpec();

    try {
      // Client that records transitions applied
      function tracingClient() {
        let counter = 0;
        const applied = [];
        return {
          applied,
          async loadSpec() {
            counter = 0;
            return { specId: "s" };
          },
          async assumeTransition(_id, t) {
            if (t === "Init") { counter = 0; applied.push(t); return { applied: true, state: { counter } }; }
            counter++; applied.push(t); return { applied: true, state: { counter } };
          },
          async nextStep() {
            return { transitions: [{ name: "A" }, { name: "B" }, { name: "Inc" }] };
          },
          async queryTrace() { return { state: { counter } }; },
          async disposeSpec() { return { disposed: true }; },
        };
      }

      const factory = () => {
        let counter = 0;
        return {
          step({ action }) {
            if (action === "Init") counter = 0;
            else counter++;
          },
          extractState() {
            return { counter };
          },
        };
      };

      const c1 = tracingClient();
      await interactiveTest(factory, c1, {
        spec: specPath,
        init: "Init",
        next: "Next",
        maxSteps: 5,
        numRuns: 1,
        seed: 42,
      });

      const c2 = tracingClient();
      await interactiveTest(factory, c2, {
        spec: specPath,
        init: "Init",
        next: "Next",
        maxSteps: 5,
        numRuns: 1,
        seed: 42,
      });

      expect(c1.applied).toEqual(c2.applied);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
