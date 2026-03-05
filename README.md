# tla-connect

TLA+/Apalache integration for model-based testing in JavaScript/TypeScript.

## Overview

`tla-connect` verifies that your JavaScript/TypeScript implementation matches a [TLA+](https://lamport.azurewebsites.net/tla/tla.html) specification using [Apalache](https://apalache.informal.systems/). Three testing approaches:

1. **Batch trace replay** - Generate ITF traces offline, replay against a Driver
2. **Interactive symbolic testing** - Drive Apalache's RPC server to explore transitions on-the-fly
3. **Post-hoc trace validation** - Emit state traces from your implementation, validate against the spec

Plus: ITF decoding, structured errors, progress callbacks, and full TypeScript types.

```
Approach 1:  TLA+ spec  →  Apalache  →  ITF traces  →  replay against Driver
Approach 2:  TLA+ spec  →  Apalache RPC  ↔  interactive exploration  ↔  Driver
Approach 3:  Driver  →  NDJSON trace  →  Apalache  →  validated
```

## Install

```bash
npm install tla-connect
```

[Apalache](https://apalache-mc.org/docs/apalache/installation/index.html) must be on your `PATH` (or pass a custom path via `apalacheBin`). For Approach 2, the Apalache RPC server must be running.

## Quick Start

### Approach 1: Batch Trace Replay

Define a Driver that bridges the spec and your implementation:

<details>
<summary>JavaScript</summary>

```js
import { generateTraces, replayTraces } from "tla-connect";

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

const { traces } = await generateTraces({
  spec: "specs/Counter.tla",
  inv: "TraceComplete",
});

const stats = replayTraces(createDriver, traces);
console.log(`${stats.traces} traces, ${stats.states} states (${stats.duration}ms)`);
```

</details>

<details open>
<summary>TypeScript</summary>

```ts
import { generateTraces, replayTraces, type Driver, type Step } from "tla-connect";

function createDriver(): Driver {
  let counter = 0;
  return {
    step({ action }: Step) {
      switch (action) {
        case "Init": counter = 0; break;
        case "Increment": counter++; break;
        case "Decrement": counter--; break;
      }
    },
    extractState(): Record<string, unknown> {
      return { counter };
    },
  };
}

const { traces } = await generateTraces({
  spec: "specs/Counter.tla",
  inv: "TraceComplete",
});

const stats = replayTraces(createDriver, traces);
console.log(`${stats.traces} traces, ${stats.states} states (${stats.duration}ms)`);
```

</details>

`extractState()` uses projection-based matching: only keys the driver returns are compared, so the spec can carry internal variables without affecting the test.

On mismatch, a `StateMismatchError` is thrown:

```
State mismatch at trace[0] state[3] after "Increment":
- counter: 4
+ counter: 3
```

### Approach 2: Interactive Symbolic Testing

<details>
<summary>JavaScript</summary>

```js
import { ApalacheRpcClient, interactiveTest } from "tla-connect";

const client = new ApalacheRpcClient("http://localhost:8822");
const stats = await interactiveTest(createDriver, client, {
  spec: "specs/Counter.tla",
  init: "Init",
  next: "Next",
  maxSteps: 20,
  numRuns: 10,
  seed: 42,
});

console.log(`${stats.runsCompleted} runs, ${stats.totalSteps} steps, ${stats.deadlocksHit} deadlocks`);
```

</details>

<details open>
<summary>TypeScript</summary>

```ts
import {
  ApalacheRpcClient,
  interactiveTestWithProgress,
  type InteractiveConfig,
  type InteractiveProgress,
} from "tla-connect";

const client = new ApalacheRpcClient("http://localhost:8822", {
  maxRetries: 5,
  initialDelayMs: 200,
});

const config: InteractiveConfig = {
  spec: "specs/Counter.tla",
  init: "Init",
  next: "Next",
  maxSteps: 20,
  numRuns: 10,
  seed: 42,
};

const stats = await interactiveTestWithProgress(
  createDriver,
  client,
  config,
  (progress: InteractiveProgress) => {
    console.log(`Run ${progress.run + 1}/${progress.numRuns}, step ${progress.step}/${progress.maxSteps}`);
  },
);

console.log(`${stats.runsCompleted} runs, ${stats.totalSteps} steps, ${stats.deadlocksHit} deadlocks`);
```

</details>

### Approach 3: Post-hoc Trace Validation

<details>
<summary>JavaScript</summary>

```js
import { StateEmitter, validateTrace } from "tla-connect";

// 1. Emit states from your implementation
const emitter = new StateEmitter("trace.ndjson");
emitter.emit("Init", { counter: 0 });
emitter.emit("Increment", { counter: 1 });
emitter.emit("Increment", { counter: 2 });
emitter.finish();

// 2. Validate trace against spec
const result = await validateTrace({
  traceSpec: "specs/CounterTrace.tla",
  init: "Init",
  next: "Next",
  inv: "TraceInv",
}, "trace.ndjson");

console.log(result.valid ? "Trace is valid" : `Invalid: ${result.reason}`);
```

</details>

<details open>
<summary>TypeScript</summary>

```ts
import { StateEmitter, validateTrace, type TraceValidatorConfig } from "tla-connect";

// 1. Emit states from your implementation
const emitter = new StateEmitter("trace.ndjson");
emitter.emit("Init", { counter: 0 });
emitter.emit("Increment", { counter: 1 });
emitter.emit("Increment", { counter: 2 });
const count: number = emitter.finish();

// 2. Validate trace against spec
const config: TraceValidatorConfig = {
  traceSpec: "specs/CounterTrace.tla",
  init: "Init",
  next: "Next",
  inv: "TraceInv",
};

const result = await validateTrace(config, "trace.ndjson");

if (result.valid) {
  console.log("Trace is valid");
} else {
  console.error(`Invalid: ${result.reason}`);
}
```

</details>

### Error Handling

<details>
<summary>JavaScript</summary>

```js
import { replayTraces, StateMismatchError, TraceGenError } from "tla-connect";

try {
  const { traces } = await generateTraces({ spec: "spec.tla", inv: "Inv" });
  replayTraces(createDriver, traces);
} catch (err) {
  if (err instanceof StateMismatchError) {
    console.error(`Mismatch at trace ${err.traceIndex}, state ${err.stateIndex}`);
    console.error(err.diff);
  } else if (err instanceof TraceGenError) {
    console.error(`Apalache failed (exit ${err.exitCode}): ${err.stderr}`);
  }
}
```

</details>

<details open>
<summary>TypeScript</summary>

```ts
import {
  generateTraces,
  replayTraces,
  StateMismatchError,
  TraceGenError,
  StepError,
  RpcError,
} from "tla-connect";

try {
  const { traces } = await generateTraces({ spec: "spec.tla", inv: "Inv" });
  replayTraces(createDriver, traces);
} catch (err: unknown) {
  if (err instanceof StateMismatchError) {
    console.error(`Mismatch at trace ${err.traceIndex}, state ${err.stateIndex}`);
    console.error(`After "${err.action}":\n${err.diff}`);
  } else if (err instanceof StepError) {
    const ctx = err.context;
    if (ctx.kind === "replay") {
      console.error(`Replay failure: trace ${ctx.trace}, state ${ctx.state}`);
    } else {
      console.error(`RPC failure: run ${ctx.run}, step ${ctx.step}`);
    }
  } else if (err instanceof TraceGenError) {
    console.error(`Apalache failed (exit ${err.exitCode}): ${err.stderr}`);
  } else if (err instanceof RpcError) {
    console.error(`RPC error${err.code ? ` (${err.code})` : ""}: ${err.message}`);
  }
}
```

</details>

## API

### Trace Generation

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
| `maxTraces` | `number` | - | Max traces (`--max-run` / `--max-error`) |
| `view` | `string` | - | View expression (`--view`) |
| `cinit` | `string` | - | Constant initializer predicate |
| `timeout` | `number` | - | Subprocess timeout in ms |
| `keepOutputs` | `boolean` | `false` | Keep temp output directory |

Throws `TraceGenError` on failure (with `exitCode`, `stdout`, `stderr`).

### Trace Replay (Approach 1)

#### `replayTrace(driverFactory, trace, traceIndex?): { states, duration }`

Replay a single trace. Throws `StateMismatchError` on divergence.

#### `replayTraces(driverFactory, traces): { traces, states, duration }`

Replay all traces. Fresh driver per trace.

#### `replayTracesWithProgress(driverFactory, traces, progressFn): { traces, states, duration }`

Replay with a progress callback. `progressFn` receives `{ traceIndex, traceCount, statesCompleted, statesTotal }`.

#### `replayTraceStr(driverFactory, json, traceIndex?): { states, duration }`

Parse an ITF JSON string and replay in one call.

### Interactive Testing (Approach 2)

#### `ApalacheRpcClient`

```ts
const client = new ApalacheRpcClient(baseUrl: string, retryConfig?: RetryConfig)
```

JSON-RPC 2.0 client for the Apalache server. Uses native `fetch()`.

| RetryConfig | Type | Default | Description |
|---|---|---|---|
| `maxRetries` | `number` | `3` | Max retry attempts |
| `initialDelayMs` | `number` | `100` | Initial backoff delay |
| `backoffMultiplier` | `number` | `2` | Backoff multiplier |
| `maxDelayMs` | `number` | `5000` | Max backoff delay |

Methods: `ping()`, `loadSpec()`, `assumeTransition()`, `nextStep()`, `rollback()`, `assumeState()`, `queryTrace()`, `disposeSpec()`.

#### `interactiveTest(driverFactory, client, config): Promise<InteractiveStats>`

Run interactive symbolic testing.

| Config | Type | Default | Description |
|---|---|---|---|
| `spec` | `string` | required | Path to main `.tla` file |
| `auxFiles` | `string[]` | auto-collected | Additional `.tla` files |
| `init` | `string` | required | Init predicate name |
| `next` | `string` | required | Next-state relation name |
| `maxSteps` | `number` | `20` | Max steps per run |
| `numRuns` | `number` | `1` | Number of exploration runs |
| `constants` | `Record<string, string>` | - | CONSTANT overrides |
| `seed` | `number` | `Date.now()` | PRNG seed for reproducibility |

Returns `InteractiveStats`: `{ runsCompleted, totalSteps, deadlocksHit, duration }`.

#### `interactiveTestWithProgress(driverFactory, client, config, progressFn): Promise<InteractiveStats>`

Same as above, with progress callback receiving `{ run, numRuns, step, maxSteps }`.

### State Emitter (Approach 3, Part 1)

#### `new StateEmitter(filePath)`

Synchronous NDJSON writer. Each line: `{"action":"...", ...state}`.

- `emit(action, state)` - write one state line
- `finish(): number` - finalize, returns line count. No further emits allowed.

### Trace Validation (Approach 3, Part 2)

#### `validateTrace(config, tracePath): Promise<{ valid, reason? }>`

Validate an NDJSON trace against a TLA+ spec via Apalache.

| Config | Type | Default | Description |
|---|---|---|---|
| `traceSpec` | `string` | required | Path to TLA+ trace spec |
| `init` | `string` | required | Init predicate |
| `next` | `string` | required | Next-state relation |
| `inv` | `string` | required | Invariant to check |
| `cinit` | `string` | - | Constant initializer |
| `apalacheBin` | `string` | `"apalache-mc"` | Binary path |
| `timeout` | `number` | - | Subprocess timeout in ms |

#### `ndjsonToTlaModule(objects): string`

Convert an array of NDJSON objects to a TLA+ `TraceData` module. Validates schema consistency, rejects floats, generates Snowcat type annotations.

### Trace Loading

#### `loadTrace(filePath): ItfTrace`

Load and parse a single `.itf.json` file.

#### `loadTracesFromDir(dirPath): ItfTrace[]`

Recursively load all `.itf.json` files, sorted by path.

### ITF Parsing

#### `parseItfTrace(json): ItfTrace`

Parse an ITF JSON string. Action resolution priority: `#meta` (action/label/transition) > `action_taken` field > `edge` field > default. Extracts `nondetPicks` from `nondet_picks` field when present.

#### `decodeItfValue(raw): unknown`

Decode Apalache ITF values to native JS types:

| ITF | JS |
|---|---|
| `{"#bigint": "42"}` | `42` / `BigInt` |
| `{"#set": [...]}` | `Set` |
| `{"#tup": [...]}` | `Array` |
| `{"#map": [[k,v]...]}` | `Map` |

### Errors

| Error | When | Extra fields |
|---|---|---|
| `StateMismatchError` | Replay state divergence | `traceIndex`, `stateIndex`, `action`, `expected`, `actual`, `diff` |
| `StepError` | Step failure (replay or RPC) | `context` (`{kind:"replay"}` or `{kind:"rpc"}`), `action`, `expected`, `actual`, `diff` |
| `TraceGenError` | Apalache subprocess failure | `exitCode`, `stdout`, `stderr` |
| `ValidationError` | Trace/schema validation failure | `reason` |
| `RpcError` | JSON-RPC communication failure | `code` |

### Utilities

#### `stateDiff(expected, actual): string`

Field-by-field diff between two state objects.

#### `valueEquals(a, b): boolean`

Deep equality for decoded ITF values (handles `Set`, `Map`, `BigInt`).

#### `statesMatch(specState, implState): boolean`

Projection-based state comparison.

## Subpath Exports

```ts
import { ApalacheRpcClient } from "tla-connect/rpc";
import { makeRequest } from "tla-connect/rpc/types";
import { interactiveTest } from "tla-connect/interactive";
import { StateEmitter } from "tla-connect/emitter";
import { validateTrace } from "tla-connect/validator";
import { StepError, RpcError } from "tla-connect/errors";
```

## Requirements

- Node.js 18+ (or Bun)
- Apalache on `PATH` (Approaches 1 & 3)
- Apalache RPC server running (Approach 2)

## License

MIT
