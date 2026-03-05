import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { ApalacheRpcClient } from "../src/rpc/client.js";
import { makeRequest } from "../src/rpc/types.js";
import { RpcError } from "../src/errors.js";

/** @type {import("bun").Server} */
let server;
/** @type {number} */
let port;

/** @type {(req: Request) => Response | Promise<Response>} */
let handler = () => new Response("not configured", { status: 500 });

beforeAll(() => {
  server = Bun.serve({
    port: 0, // random available port
    fetch(req) {
      return handler(req);
    },
  });
  port = server.port;
});

afterAll(() => {
  server.stop(true);
});

function setHandler(fn) {
  handler = fn;
}

function jsonRpcOk(id, result) {
  return Response.json({ jsonrpc: "2.0", id, result });
}

function jsonRpcError(id, code, message) {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } });
}

describe("makeRequest", () => {
  test("creates well-formed request", () => {
    const req = makeRequest(1, "ping");
    expect(req).toEqual({ jsonrpc: "2.0", id: 1, method: "ping" });
  });

  test("includes params when provided", () => {
    const req = makeRequest(2, "loadSpec", { spec: "abc" });
    expect(req.params).toEqual({ spec: "abc" });
  });
});

describe("ApalacheRpcClient", () => {
  test("ping returns true on success", async () => {
    setHandler(async (req) => {
      const body = await req.json();
      return jsonRpcOk(body.id, "pong");
    });

    const client = new ApalacheRpcClient(`http://localhost:${port}`);
    expect(await client.ping()).toBe(true);
  });

  test("ping returns false on network error", async () => {
    // Use a port that nothing listens on
    const client = new ApalacheRpcClient("http://localhost:1", {
      maxRetries: 0,
    });
    expect(await client.ping()).toBe(false);
  });

  test("loadSpec sends correct request", async () => {
    setHandler(async (req) => {
      const body = await req.json();
      expect(body.method).toBe("loadSpec");
      expect(body.params.spec).toBe("base64data");
      return jsonRpcOk(body.id, { specId: "spec-123" });
    });

    const client = new ApalacheRpcClient(`http://localhost:${port}`);
    const result = await client.loadSpec({
      spec: "base64data",
      auxFiles: [],
      init: "Init",
      next: "Next",
    });
    expect(result.specId).toBe("spec-123");
  });

  test("assumeTransition", async () => {
    setHandler(async (req) => {
      const body = await req.json();
      expect(body.method).toBe("assumeTransition");
      return jsonRpcOk(body.id, { applied: true, state: { x: 1 } });
    });

    const client = new ApalacheRpcClient(`http://localhost:${port}`);
    const result = await client.assumeTransition("spec-1", "Init");
    expect(result.applied).toBe(true);
    expect(result.state).toEqual({ x: 1 });
  });

  test("nextStep", async () => {
    setHandler(async (req) => {
      const body = await req.json();
      return jsonRpcOk(body.id, {
        transitions: [{ name: "Inc" }, { name: "Dec" }],
      });
    });

    const client = new ApalacheRpcClient(`http://localhost:${port}`);
    const result = await client.nextStep("spec-1");
    expect(result.transitions).toHaveLength(2);
    expect(result.transitions[0].name).toBe("Inc");
  });

  test("rollback", async () => {
    setHandler(async (req) => {
      const body = await req.json();
      return jsonRpcOk(body.id, { success: true });
    });

    const client = new ApalacheRpcClient(`http://localhost:${port}`);
    const result = await client.rollback("spec-1");
    expect(result.success).toBe(true);
  });

  test("assumeState", async () => {
    setHandler(async (req) => {
      const body = await req.json();
      return jsonRpcOk(body.id, { applied: true });
    });

    const client = new ApalacheRpcClient(`http://localhost:${port}`);
    const result = await client.assumeState("spec-1", { x: 42 });
    expect(result.applied).toBe(true);
  });

  test("queryTrace", async () => {
    setHandler(async (req) => {
      const body = await req.json();
      return jsonRpcOk(body.id, { state: { counter: 5 } });
    });

    const client = new ApalacheRpcClient(`http://localhost:${port}`);
    const result = await client.queryTrace("spec-1");
    expect(result.state).toEqual({ counter: 5 });
  });

  test("disposeSpec", async () => {
    setHandler(async (req) => {
      const body = await req.json();
      return jsonRpcOk(body.id, { disposed: true });
    });

    const client = new ApalacheRpcClient(`http://localhost:${port}`);
    const result = await client.disposeSpec("spec-1");
    expect(result.disposed).toBe(true);
  });

  test("throws RpcError on JSON-RPC error response", async () => {
    setHandler(async (req) => {
      const body = await req.json();
      return jsonRpcError(body.id, -32601, "Method not found");
    });

    const client = new ApalacheRpcClient(`http://localhost:${port}`);
    try {
      await client.loadSpec({ spec: "", auxFiles: [], init: "Init", next: "Next" });
      expect(true).toBe(false);
    } catch (e) {
      expect(e).toBeInstanceOf(RpcError);
      expect(e.code).toBe(-32601);
      expect(e.message).toBe("Method not found");
    }
  });

  test("does not retry on RpcError", async () => {
    let calls = 0;
    setHandler(async (req) => {
      calls++;
      const body = await req.json();
      return jsonRpcError(body.id, -32600, "Invalid request");
    });

    const client = new ApalacheRpcClient(`http://localhost:${port}`, {
      maxRetries: 3,
    });
    try {
      await client.loadSpec({ spec: "", auxFiles: [], init: "Init", next: "Next" });
    } catch {
      // expected
    }
    expect(calls).toBe(1); // no retries for app errors
  });

  test("retries on network errors then succeeds", async () => {
    let calls = 0;
    setHandler(async (req) => {
      calls++;
      if (calls < 3) {
        // Simulate a server error
        return new Response("Internal Server Error", { status: 500 });
      }
      const body = await req.json();
      return jsonRpcOk(body.id, "pong");
    });

    const client = new ApalacheRpcClient(`http://localhost:${port}`, {
      maxRetries: 3,
      initialDelayMs: 10,
    });

    // This should eventually succeed after retries
    // The first two calls return 500 which causes json parse to fail,
    // triggering retry logic
    const result = await client.ping();
    expect(result).toBe(true);
    expect(calls).toBe(3);
  });

  test("auto-incrementing request IDs", async () => {
    const ids = [];
    setHandler(async (req) => {
      const body = await req.json();
      ids.push(body.id);
      return jsonRpcOk(body.id, "ok");
    });

    const client = new ApalacheRpcClient(`http://localhost:${port}`);
    await client.ping();
    await client.ping();
    await client.ping();

    expect(ids[1]).toBe(ids[0] + 1);
    expect(ids[2]).toBe(ids[1] + 1);
  });
});
