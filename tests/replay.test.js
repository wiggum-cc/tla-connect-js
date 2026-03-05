import { test, expect, describe } from "bun:test";
import { replayTrace, replayTraces, StateMismatchError } from "../src/replay.js";

/** Helper to build a trace from state list */
function makeTrace(states) {
  return {
    meta: {},
    vars: Object.keys(states[0]?.values ?? {}),
    states: states.map((s, i) => ({
      index: i,
      edge: s.edge ?? (i === 0 ? "Init" : "unknown"),
      values: s.values,
    })),
  };
}

describe("replayTrace", () => {
  test("happy path – counter trace replays without mismatch", () => {
    const trace = makeTrace([
      { edge: "Init", values: { counter: 0 } },
      { edge: "Increment", values: { counter: 1 } },
      { edge: "Increment", values: { counter: 2 } },
    ]);

    let counter = 0;
    const factory = () => ({
      step({ action }) {
        if (action === "Init") counter = 0;
        else if (action === "Increment") counter++;
      },
      extractState() {
        return { counter };
      },
    });

    const result = replayTrace(factory, trace);
    expect(result.states).toBe(3);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  test("detects state mismatch", () => {
    const trace = makeTrace([
      { edge: "Init", values: { counter: 0 } },
      { edge: "Increment", values: { counter: 1 } },
    ]);

    const factory = () => ({
      step() {},
      extractState() {
        return { counter: 999 }; // always wrong
      },
    });

    expect(() => replayTrace(factory, trace)).toThrow(StateMismatchError);

    try {
      replayTrace(factory, trace);
    } catch (e) {
      expect(e).toBeInstanceOf(StateMismatchError);
      expect(e.stateIndex).toBe(0);
      expect(e.action).toBe("Init");
      expect(e.expected.counter).toBe(0);
      expect(e.actual.counter).toBe(999);
      expect(e.diff).toContain("counter");
    }
  });

  test("action extracted from edge field", () => {
    const trace = makeTrace([
      { edge: "Init", values: { state: "idle" } },
      { edge: "Idle_Open", values: { state: "open" } },
    ]);

    const actions = [];
    const factory = () => {
      let current = "idle";
      return {
        step({ action }) {
          actions.push(action);
          if (action === "Idle_Open") current = "open";
        },
        extractState() {
          return { state: current };
        },
      };
    };

    replayTrace(factory, trace);
    expect(actions).toEqual(["Init", "Idle_Open"]);
  });

  test("projection – driver tracks subset of spec vars", () => {
    const trace = makeTrace([
      {
        edge: "Init",
        values: { state: "idle", edge: "Init", internalFlag: true, counter: 0 },
      },
      {
        edge: "Step",
        values: { state: "active", edge: "Step", internalFlag: false, counter: 1 },
      },
    ]);

    // Driver only tracks `state` – ignores edge, internalFlag, counter
    const factory = () => {
      let current = "idle";
      return {
        step({ action }) {
          if (action === "Step") current = "active";
        },
        extractState() {
          return { state: current };
        },
      };
    };

    const result = replayTrace(factory, trace);
    expect(result.states).toBe(2);
  });

  test("StateMismatchError has correct traceIndex", () => {
    const trace = makeTrace([
      { edge: "Init", values: { x: 1 } },
    ]);

    const factory = () => ({
      step() {},
      extractState() {
        return { x: 2 };
      },
    });

    try {
      replayTrace(factory, trace, 5);
    } catch (e) {
      expect(e.traceIndex).toBe(5);
    }
  });
});

describe("replayTraces", () => {
  test("replays multiple traces", () => {
    const trace1 = makeTrace([
      { edge: "Init", values: { n: 0 } },
      { edge: "Inc", values: { n: 1 } },
    ]);
    const trace2 = makeTrace([
      { edge: "Init", values: { n: 0 } },
      { edge: "Inc", values: { n: 1 } },
      { edge: "Inc", values: { n: 2 } },
    ]);

    const factory = () => {
      let n = 0;
      return {
        step({ action }) {
          if (action === "Init") n = 0;
          else if (action === "Inc") n++;
        },
        extractState() {
          return { n };
        },
      };
    };

    const result = replayTraces(factory, [trace1, trace2]);
    expect(result.traces).toBe(2);
    expect(result.states).toBe(5);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  test("mismatch in second trace reports correct traceIndex", () => {
    const good = makeTrace([
      { edge: "Init", values: { v: 0 } },
    ]);
    const bad = makeTrace([
      { edge: "Init", values: { v: 0 } },
      { edge: "Step", values: { v: 42 } },
    ]);

    const factory = () => {
      let v = 0;
      return {
        step({ action }) {
          if (action === "Init") v = 0;
          // intentionally doesn't handle Step → mismatch
        },
        extractState() {
          return { v };
        },
      };
    };

    try {
      replayTraces(factory, [good, bad]);
      expect(true).toBe(false); // should not reach
    } catch (e) {
      expect(e).toBeInstanceOf(StateMismatchError);
      expect(e.traceIndex).toBe(1);
      expect(e.stateIndex).toBe(1);
    }
  });

  test("fresh driver per trace", () => {
    const trace = makeTrace([
      { edge: "Init", values: { count: 0 } },
      { edge: "Inc", values: { count: 1 } },
    ]);

    let creations = 0;
    const factory = () => {
      creations++;
      let count = 0;
      return {
        step({ action }) {
          if (action === "Init") count = 0;
          else count++;
        },
        extractState() {
          return { count };
        },
      };
    };

    replayTraces(factory, [trace, trace, trace]);
    expect(creations).toBe(3);
  });
});
