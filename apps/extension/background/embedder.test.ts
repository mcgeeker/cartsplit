import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the transformers package before importing the module under test.
const { pipelineMock, envMock } = vi.hoisted(() => ({
  pipelineMock: vi.fn(),
  envMock: {
    backends: { onnx: { wasm: {} as { wasmPaths?: string; numThreads?: number } } },
  },
}));
vi.mock("@huggingface/transformers", () => ({
  pipeline: pipelineMock,
  env: envMock,
}));
vi.mock("wxt/browser", () => ({
  browser: { runtime: { getURL: (p: string) => `chrome-extension://test${p}` } },
}));

import { embedBatch, _resetForTest } from "./embedder";

const embed = async (text: string, signal?: AbortSignal) => (await embedBatch([text], signal))[0]!;

function makePipelineFn() {
  return vi.fn(async (texts: string | string[], _opts: unknown) => {
    const arr = Array.isArray(texts) ? texts : [texts];
    const tensorData = new Float32Array(arr.length * 384);
    for (let i = 0; i < arr.length; i++) tensorData[i * 384] = 1;
    return { data: tensorData, dims: [arr.length, 384] };
  });
}

beforeEach(() => {
  _resetForTest();
  envMock.backends.onnx.wasm = {};
  const pipeFn = makePipelineFn();
  pipelineMock.mockResolvedValue(pipeFn);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("embedder", () => {
  it("embed() returns a 384-dim normalized Float32Array", async () => {
    const v = await embed("paper towels");
    expect(v).toBeInstanceOf(Float32Array);
    expect(v.length).toBe(384);
    expect(v[0]).toBeCloseTo(1, 5);
  });

  it("embedBatch() returns an array of 384-dim vectors", async () => {
    const vs = await embedBatch(["paper towels", "trash bags", "lightbulb"]);
    expect(vs).toHaveLength(3);
    for (const v of vs) {
      expect(v.length).toBe(384);
    }
  });

  it("embed() lazy-loads pipeline once across calls", async () => {
    await embed("a");
    await embed("b");
    await embed("c");
    expect(pipelineMock).toHaveBeenCalledTimes(1);
  });

  it("re-attempts the load after a failed one instead of caching the rejection", async () => {
    pipelineMock.mockRejectedValueOnce(new Error("download aborted"));
    await expect(embed("a")).rejects.toThrow("download aborted");

    // Next call must retry the load, not replay the cached rejection.
    pipelineMock.mockResolvedValueOnce(makePipelineFn());
    const v = await embed("b");
    expect(v.length).toBe(384);
    expect(pipelineMock).toHaveBeenCalledTimes(2);
  });

  it("embedBatch([]) returns [] without calling the model", async () => {
    const vs = await embedBatch([]);
    expect(vs).toEqual([]);
    expect(pipelineMock).not.toHaveBeenCalled();
  });

  it("sets wasmPaths to the extension /ort/ dir on Firefox", async () => {
    vi.stubEnv("BROWSER", "firefox");
    await embed("paper towels");
    expect(envMock.backends.onnx.wasm.wasmPaths).toBe("chrome-extension://test/ort/");
    expect(envMock.backends.onnx.wasm.numThreads).toBe(1);
  });

  it("does NOT set wasmPaths on Chrome — its MV3 service worker forbids the dynamic import() that wasmPaths triggers", async () => {
    vi.stubEnv("BROWSER", "chrome");
    await embed("paper towels");
    expect(envMock.backends.onnx.wasm.wasmPaths).toBeUndefined();
    expect(envMock.backends.onnx.wasm.numThreads).toBe(1);
  });
});

it("cancels during a shared model load without starting inference when that load finishes", async () => {
  let finish!: (pipeline: any) => void;
  pipelineMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const controller = new AbortController(); const pending = embed("test title", controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  const pipeline = makePipelineFn(); controller.abort(); await rejected;
  // Cancellation resolves before the public model download settles.
  finish(pipeline);
  expect(pipeline).not.toHaveBeenCalled();
  // Public shared model loading may finish; another explicit operation can use it.
  expect(await embed("another test title")).toHaveLength(384);
});

it("pins the model revision and never probes local or remote text services", async () => {
  await embed("Synthetic item");
  expect(pipelineMock).toHaveBeenCalledWith("feature-extraction", "Xenova/bge-small-en-v1.5", { dtype: "q8", revision: "ea104dacec62c0de699686887e3f920caeb4f3e3" });
  expect(envMock).toMatchObject({ allowLocalModels: false, remoteHost: "https://huggingface.co/" });
});
it("rejects malformed tensors instead of persisting partial vectors", async () => {
  pipelineMock.mockResolvedValueOnce(async () => ({ data: new Float32Array([NaN]) }));
  await expect(embedBatch(["Synthetic"])).rejects.toThrow("Invalid local model output");
});
it("rejects oversized batches before loading the model", async () => {
  await expect(embedBatch(Array(9).fill("Synthetic"))).rejects.toThrow("limits");
  await expect(embedBatch(["X".repeat(1001)])).rejects.toThrow("limits");
  expect(pipelineMock).not.toHaveBeenCalled();
});
