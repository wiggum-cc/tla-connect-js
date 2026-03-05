// @ts-check

/**
 * Approach 2: Interactive symbolic testing via Apalache RPC.
 * @module
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { statesMatch, projectState } from "./_compare.js";
import { stateDiff } from "./diff.js";
import { StepError } from "./errors.js";

/**
 * @typedef {import("./replay.js").Driver} Driver
 */

/**
 * @typedef {Object} InteractiveConfig
 * @property {string} spec       - path to main .tla file
 * @property {string[]} [auxFiles] - additional .tla file paths (auto-collected from spec dir if omitted)
 * @property {string} init       - init predicate name
 * @property {string} next       - next-state relation name
 * @property {number} [maxSteps=20]
 * @property {number} [numRuns=1]
 * @property {Record<string, string>} [constants]
 * @property {number} [seed]     - PRNG seed for reproducible transition shuffling
 */

/**
 * @typedef {Object} InteractiveStats
 * @property {number} runsCompleted
 * @property {number} totalSteps
 * @property {number} deadlocksHit
 * @property {number} duration
 */

/**
 * @typedef {Object} InteractiveProgress
 * @property {number} run
 * @property {number} numRuns
 * @property {number} step
 * @property {number} maxSteps
 */

/**
 * Seeded xorshift32 PRNG for reproducible shuffling.
 * @param {number} seed
 * @returns {() => number} - returns values in [0, 1)
 */
function xorshift32(seed) {
  let state = seed | 0 || 1; // ensure non-zero
  return () => {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle in-place using a PRNG.
 * @template T
 * @param {T[]} arr
 * @param {() => number} rng
 * @returns {T[]}
 */
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Collect all .tla files from a directory (non-recursive).
 * @param {string} dir
 * @returns {string[]}
 */
function collectTlaFiles(dir) {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".tla"))
      .map((f) => join(dir, f));
  } catch {
    return [];
  }
}

/**
 * Read a file and base64-encode it.
 * @param {string} filePath
 * @returns {string}
 */
function fileToBase64(filePath) {
  const buf = readFileSync(filePath);
  return buf.toString("base64");
}

/**
 * Run interactive symbolic testing.
 *
 * @param {() => Driver} driverFactory
 * @param {import("./rpc/client.js").ApalacheRpcClient} client
 * @param {InteractiveConfig} config
 * @returns {Promise<InteractiveStats>}
 */
export async function interactiveTest(driverFactory, client, config) {
  return interactiveTestWithProgress(driverFactory, client, config, () => {});
}

/**
 * Run interactive symbolic testing with progress callbacks.
 *
 * @param {() => Driver} driverFactory
 * @param {import("./rpc/client.js").ApalacheRpcClient} client
 * @param {InteractiveConfig} config
 * @param {(progress: InteractiveProgress) => void} progressFn
 * @returns {Promise<InteractiveStats>}
 */
export async function interactiveTestWithProgress(driverFactory, client, config, progressFn) {
  const {
    spec,
    init,
    next,
    maxSteps = 20,
    numRuns = 1,
    constants,
    seed,
  } = config;

  // Collect aux files
  const auxFilePaths = config.auxFiles ?? collectTlaFiles(dirname(spec)).filter((f) => f !== spec);

  // Base64-encode spec and aux files
  const specB64 = fileToBase64(spec);
  const auxB64 = auxFilePaths.map(fileToBase64);

  const rng = xorshift32(seed ?? Date.now());
  const start = performance.now();
  let totalSteps = 0;
  let deadlocksHit = 0;

  for (let run = 0; run < numRuns; run++) {
    const driver = driverFactory();

    // Load spec
    const { specId } = await client.loadSpec({
      spec: specB64,
      auxFiles: auxB64,
      init,
      next,
      constants,
    });

    try {
      // Apply init transition
      const initResult = await client.assumeTransition(specId, init);
      if (!initResult.applied) {
        throw new StepError(
          `Init transition "${init}" not applicable`,
          { kind: "rpc", run, step: 0 },
          init,
          {},
          {},
          "",
        );
      }

      // Query initial state and drive
      const initQuery = await client.queryTrace(specId);
      driver.step({ action: init, state: initQuery.state, index: 0 });

      const implState = driver.extractState();
      const implKeys = Object.keys(implState);
      if (!statesMatch(initQuery.state, implState)) {
        const projected = projectState(initQuery.state, implKeys);
        const diff = stateDiff(projected, implState);
        throw new StepError(
          `State mismatch at run[${run}] step[0] after "${init}":\n${diff}`,
          { kind: "rpc", run, step: 0 },
          init,
          projected,
          implState,
          diff,
        );
      }

      totalSteps++;

      // Step loop
      for (let step = 1; step <= maxSteps; step++) {
        progressFn({ run, numRuns, step, maxSteps });

        // Get available transitions
        const { transitions } = await client.nextStep(specId);

        if (transitions.length === 0) {
          deadlocksHit++;
          break; // deadlock
        }

        // Shuffle transitions for exploration
        shuffle(transitions, rng);

        // Try to find an enabled transition
        let applied = false;
        for (const transition of transitions) {
          const result = await client.assumeTransition(specId, transition.name);
          if (result.applied) {
            // Query state after transition
            const query = await client.queryTrace(specId);
            driver.step({ action: transition.name, state: query.state, index: step });

            const currentImpl = driver.extractState();
            const currentKeys = Object.keys(currentImpl);
            if (!statesMatch(query.state, currentImpl)) {
              const proj = projectState(query.state, currentKeys);
              const d = stateDiff(proj, currentImpl);
              throw new StepError(
                `State mismatch at run[${run}] step[${step}] after "${transition.name}":\n${d}`,
                { kind: "rpc", run, step },
                transition.name,
                proj,
                currentImpl,
                d,
              );
            }

            totalSteps++;
            applied = true;
            break;
          }
        }

        if (!applied) {
          deadlocksHit++;
          break; // all transitions disabled = deadlock
        }
      }
    } finally {
      await client.disposeSpec(specId);
    }
  }

  return {
    runsCompleted: numRuns,
    totalSteps,
    deadlocksHit,
    duration: performance.now() - start,
  };
}
