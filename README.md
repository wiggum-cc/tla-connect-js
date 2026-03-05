# tla-connect

TLA+/Apalache integration for model-based testing in JavaScript.

## Overview

`tla-connect` verifies that your JavaScript implementation matches a [TLA+](https://lamport.azurewebsites.net/tla/tla.html) specification using [Apalache](https://apalache.informal.systems/). It enables:

- **Trace replay**: Generate execution traces from TLA+ specs and replay them against your code
- **State comparison**: Detect where implementation diverges from the spec with field-level diffs
- **ITF decoding**: Parse Apalache's [Informal Trace Format](https://apalache-mc.org/docs/adr/015adr-trace.html) into native JS types

```
TLA+ spec  ->  Apalache  ->  ITF traces  ->  replay against JS Driver  ->  spec/impl match
```

## Install

```bash
npm install tla-connect
```

[Apalache](https://apalache-mc.org/docs/apalache/installation/index.html) must be on your `PATH` (or pass a custom path via `apalacheBin`).

## Quick Start

Define a Driver that bridges the spec and your implementation:

```js
import { generateTraces, replayTraces } from "tla-connect";

// Driver maps spec actions to implementation operations
function createDriver() {
  let counter = 0;
  return {
    step({ action }) {
      switch (action) {
        case "Init": counter = 0; break;
        case "Increment": counter++; break;
        case "Decrement": counter--; break;
      }
    },
    extractState() {
      return { counter };
    },
  };
}

// Generate traces from spec, replay against driver
const { traces } = await generateTraces({
  spec: "specs/Counter.tla",
  inv: "TraceComplete",
});

const stats = replayTraces(createDriver, traces);
console.log(`${stats.traces} traces, ${stats.states} states (${stats.duration}ms)`);
```

`extractState()` uses projection-based matching: only keys the driver returns are compared, so the spec can carry internal variables without affecting the test.

On mismatch, a `StateMismatchError` is thrown:

```
State mismatch at trace[0] state[3] after "Increment":
- counter: 4
+ counter: 3
```

## API

### Trace generation

#### `generateTraces(config): Promise<{ traces, outDir }>`

Run Apalache to generate execution traces from a TLA+ spec.

| Option | Type | Default | Description |
|---|---|---|---|
| `spec` | `string` | required | Path to `.tla` file |
| `inv` | `string` | required | Invariant name |
| `maxLength` | `number` | `15` | Max trace length |
| `mode` | `"check" \| "simulate"` | `"check"` | Apalache mode |
| `outDir` | `string` | temp dir | Output directory |
| `apalacheBin` | `string` | `"apalache-mc"` | Binary path |

### Trace replay

#### `replayTrace(driverFactory, trace, traceIndex?): { states, duration }`

Replay a single trace. Throws `StateMismatchError` on divergence.

#### `replayTraces(driverFactory, traces): { traces, states, duration }`

Replay all traces. Fresh driver per trace.

### Trace loading

#### `loadTrace(filePath): ItfTrace`

Load and parse a single `.itf.json` file.

#### `loadTracesFromDir(dirPath): ItfTrace[]`

Recursively load all `.itf.json` files, sorted by path.

### ITF parsing

#### `parseItfTrace(json): ItfTrace`

Parse an ITF JSON string.

#### `decodeItfValue(raw): unknown`

Decode Apalache ITF values to native JS types:

| ITF | JS |
|---|---|
| `{"#bigint": "42"}` | `42` / `BigInt` |
| `{"#set": [...]}` | `Set` |
| `{"#tup": [...]}` | `Array` |
| `{"#map": [[k,v]...]}` | `Map` |

### Utilities

#### `stateDiff(expected, actual): string`

Field-by-field diff between two state objects.

#### `StateMismatchError`

Properties: `traceIndex`, `stateIndex`, `action`, `expected`, `actual`, `diff`.

## Requirements

- Node.js 18+ (or Bun)
- Apalache on `PATH`

## See also

- [tla-connect (Rust)](https://github.com/wiggum-cc/tla-connect-rs) - Rust version with additional approaches: interactive RPC symbolic testing and post-hoc trace validation

## License

MIT
