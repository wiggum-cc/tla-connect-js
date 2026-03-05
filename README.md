# tla-connect

Model-based testing with [Apalache](https://apalache-mc.org/) TLA+ model checker for JavaScript.

Write a TLA+ spec, let Apalache generate counterexample traces, then replay those traces against your JavaScript implementation to verify correctness.

## Install

```bash
npm install tla-connect
```

Apalache must be available on your `PATH` (or pass a custom path via `apalacheBin`). See the [Apalache installation guide](https://apalache-mc.org/docs/apalache/installation/index.html).

## Quick start

```js
import {
  generateTraces,
  loadTrace,
  loadTracesFromDir,
  replayTrace,
  replayTraces,
  parseItfTrace,
  decodeItfValue,
  stateDiff,
  StateMismatchError,
} from "tla-connect";
```

### 1. Generate traces from a TLA+ spec

```js
const { traces, outDir } = await generateTraces({
  spec: "./specs/Counter.tla",
  inv: "NotIn_Overflow",  // invariant to violate (generates counterexample)
  maxLength: 15,          // max trace length (default: 15)
  mode: "check",          // "check" or "simulate" (default: "check")
});

console.log(`Generated ${traces.length} traces in ${outDir}`);
```

Apalache exit code 12 (counterexample found) is treated as success – this is the normal output for reachability/coverage invariants like `NotIn_*` or `NoEdge_*`.

### 2. Write a Driver

A Driver executes spec actions against your implementation and reports its state:

```js
function createCounterDriver() {
  let count = 0;

  return {
    step({ action, state, index }) {
      switch (action) {
        case "Init":
          count = 0;
          break;
        case "Increment":
          count++;
          break;
        case "Decrement":
          count--;
          break;
      }
    },
    extractState() {
      return { count };
    },
  };
}
```

`extractState()` returns a subset of the spec's variables – only returned keys are compared (projection-based matching). This lets the spec carry internal bookkeeping variables without breaking the driver.

### 3. Replay traces

```js
// Single trace
const result = replayTrace(createCounterDriver, traces[0]);
console.log(`Replayed ${result.states} states in ${result.duration}ms`);

// All traces at once
const stats = replayTraces(createCounterDriver, traces);
console.log(`${stats.traces} traces, ${stats.states} states, ${stats.duration}ms`);
```

A fresh driver is created per trace via the factory function.

If the implementation state diverges from the spec state, a `StateMismatchError` is thrown with a human-readable diff:

```
StateMismatchError: State mismatch at trace[0] state[3] after "Increment":
- count: 4
+ count: 3
```

### 4. Load traces from disk

```js
// Single file
const trace = loadTrace("./traces/Counter_NotIn_Overflow.itf.json");

// All .itf.json files in a directory (recursive)
const traces = loadTracesFromDir("./traces/");
```

### 5. Parse ITF manually

```js
const json = fs.readFileSync("trace.itf.json", "utf-8");
const trace = parseItfTrace(json);

for (const state of trace.states) {
  console.log(state.index, state.edge, state.values);
}
```

### 6. Decode Apalache ITF values

Apalache encodes TLA+ types as JSON objects. `decodeItfValue` converts them to native JS types:

| ITF encoding | JS type |
|---|---|
| `{"#bigint": "42"}` | `42` (Number, or BigInt if unsafe) |
| `{"#set": [1, 2]}` | `Set([1, 2])` |
| `{"#tup": [1, "a"]}` | `[1, "a"]` |
| `{"#map": [["k", "v"]]}` | `Map([["k", "v"]])` |

```js
decodeItfValue({ "#bigint": "42" });           // 42
decodeItfValue({ "#set": [1, 2, 3] });         // Set {1, 2, 3}
decodeItfValue({ "#map": [["a", 1]] });        // Map {"a" => 1}
decodeItfValue({ "#bigint": "9007199254740993" }); // 9007199254740993n (BigInt)
```

### 7. State diffs

```js
const diff = stateDiff(
  { count: 4, active: true },
  { count: 3, active: true },
);
// Output:
//   active: true
// - count: 4
// + count: 3
```

## API

### `generateTraces(config): Promise<{ traces, outDir }>`

Spawn Apalache to generate ITF counterexample traces.

| Option | Type | Default | Description |
|---|---|---|---|
| `spec` | `string` | required | Path to `.tla` file |
| `inv` | `string` | required | Invariant name to check |
| `maxLength` | `number` | `15` | Max trace length |
| `mode` | `"check" \| "simulate"` | `"check"` | Apalache mode |
| `outDir` | `string` | temp dir | Output directory for traces |
| `apalacheBin` | `string` | `"apalache-mc"` | Path to Apalache binary |

### `replayTrace(driverFactory, trace, traceIndex?): { states, duration }`

Replay a single trace. Throws `StateMismatchError` on divergence.

### `replayTraces(driverFactory, traces): { traces, states, duration }`

Replay all traces. Creates a fresh driver per trace.

### `loadTrace(filePath): ItfTrace`

Load and parse a single `.itf.json` file.

### `loadTracesFromDir(dirPath): ItfTrace[]`

Recursively find and parse all `.itf.json` files, sorted by path.

### `parseItfTrace(json): ItfTrace`

Parse an ITF JSON string into a structured trace.

### `decodeItfValue(raw): unknown`

Decode an Apalache ITF value to a native JS type.

### `stateDiff(expected, actual): string`

Human-readable field-by-field diff between two state objects.

### `StateMismatchError`

Thrown when spec and implementation states diverge. Properties: `traceIndex`, `stateIndex`, `action`, `expected`, `actual`, `diff`.

## Typical MBT workflow

```
TLA+ spec  →  Apalache  →  .itf.json traces  →  replay against JS Driver  →  pass/fail
```

1. Write a TLA+ spec with invariants named `NotIn_*` (reachability) or `NoEdge_*` (edge coverage)
2. Apalache finds counterexamples that violate these invariants – each counterexample is an execution path
3. Replay those paths through your implementation
4. If your implementation matches the spec at every step, the test passes

## License

MIT
