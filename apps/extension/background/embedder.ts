import { pipeline, env, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { browser } from "wxt/browser";
import type { PublicPath } from "wxt/browser";

/**
 * Hugging Face model used for item-title embeddings. bge-small-en-v1.5 is a
 * 33M-param sentence encoder; the q8-quantized ONNX variant is ~30MB.
 * https://huggingface.co/Xenova/bge-small-en-v1.5
 */
const MODEL_ID = "Xenova/bge-small-en-v1.5";
// Immutable upstream revision: updating model data is an explicit code review.
const MODEL_REVISION = "ea104dacec62c0de699686887e3f920caeb4f3e3";

const EMBEDDING_DIMS = 384;

/**
 * Module-scope singleton. The model is expensive to instantiate (~30MB
 * download on first ever load, then WASM init from disk cache), so we keep
 * one instance per service-worker lifetime. MV3 kills the SW on idle; on
 * the next message initializes from cached files; no fixed latency is assumed.
 */
let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

/** Configure ONNX Runtime Web for the extension before the first `pipeline()`
 *  call. Idempotent. numThreads=1 because extension contexts aren't
 *  cross-origin-isolated, so there's no SharedArrayBuffer for ORT's threaded
 *  build to use.
 *
 *  wasmPaths is set on FIREFOX ONLY, and the asymmetry is load-bearing:
 *  - Setting wasmPaths makes ORT load its glue via a dynamic `import()`.
 *  - Firefox's classic background page allows that, and needs the explicit path
 *    because otherwise ORT can't resolve its own script URL and falls back to
 *    the jsDelivr CDN, which the extension CSP blocks.
 *  - Chrome's MV3 background is a service worker, where `import()` is forbidden
 *    ("import() is disallowed on ServiceWorkerGlobalScope"). So on Chrome we
 *    leave wasmPaths unset and let ORT use its statically-bundled glue, which
 *    fetches the .wasm from /ort/ (see the de-inline base in wxt.config.ts).
 *    Leaving it unset is safe because transformers.js skips its own jsDelivr
 *    wasmPaths default when it detects a service worker. */
let runtimeConfigured = false;
function configureOnnxRuntime(): void {
  if (runtimeConfigured) return;
  // env.backends.onnx.wasm is typed as possibly undefined by @huggingface/transformers.
  env.allowLocalModels = false;
  env.remoteHost = "https://huggingface.co/";
  const wasm = env.backends.onnx.wasm!;
  wasm.numThreads = 1;
  if (import.meta.env.BROWSER === "firefox") {
    // Cast: `/ort/` is a dynamic path not in WXT's generated PublicPath union.
    wasm.wasmPaths = browser.runtime.getURL("/ort/" as unknown as PublicPath);
  }
  runtimeConfigured = true;
}

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    configureOnnxRuntime();
    // `pipeline()`'s overloaded generic over every task expands to a union
    // TS can't resolve in one shot; the cast narrows to the task we asked for.
    extractorPromise = (
      pipeline("feature-extraction", MODEL_ID, {
        dtype: "q8",
        revision: MODEL_REVISION,
      }) as unknown as Promise<FeatureExtractionPipeline>
    )
      .then((extractor) => {
        // Positive proof the model finished downloading + initializing — the
        // counterpart to the failure logs (Firefox previously couldn't fetch the
        // Xet-hosted model file at all).
        console.info(`[embedder] model ready (${MODEL_ID})`);
        return extractor;
      })
      .catch((err) => {
        // Un-cache the failed load so the next call re-attempts it. Without this
        // a single failure (network blip, CORS, aborted download) poisons the
        // cache for the rest of this background lifetime and every later embed
        // silently degrades.
        extractorPromise = null;
        throw err;
      });
  }
  return extractorPromise;
}

/** Stop waiting immediately on cancellation. The shared public-file download
 * may finish and populate cache, but canceled work never reaches inference or
 * storage. In-flight WASM inference itself remains serialized until it settles. */
function waitForExtractor(signal?: AbortSignal): Promise<FeatureExtractionPipeline> {
  signal?.throwIfAborted();
  const loading = getExtractor();
  if (!signal) return loading;
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", abort);
    const abort = () => { cleanup(); reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true });
    loading.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (signal.aborted) abort();
  });
}

export async function embedBatch(texts: string[], signal?: AbortSignal): Promise<Float32Array[]> {
  signal?.throwIfAborted();
  if (texts.length === 0) return [];
  if (texts.length > 8 || texts.some(text => typeof text !== "string" || text.length > 1000)) throw new Error("Local model batch exceeds review limits.");
  const extractor = await waitForExtractor(signal);
  signal?.throwIfAborted();
  // Mean pooling averages per-token vectors into one fixed-size vector per
  // input, preserving the existing vector format. `normalize: true` makes cosine ≡ dot.
  const result = await extractor(texts, { pooling: "mean", normalize: true });
  // The model returns a Tensor with shape [N, EMBEDDING_DIMS] backed by a
  // single flat Float32Array. Slice into N copies — each slice() detaches
  // from the Tensor's underlying buffer so we can safely persist the result.
  signal?.throwIfAborted();
  const data = result.data;
  if (!(data instanceof Float32Array) || data.length !== texts.length * EMBEDDING_DIMS || !data.every(Number.isFinite)) {
    throw new Error("Invalid local model output.");
  }
  return Array.from({ length: texts.length }, (_, i) =>
    data.slice(i * EMBEDDING_DIMS, (i + 1) * EMBEDDING_DIMS),
  );
}

/** @internal — for tests only. */
export function _resetForTest(): void {
  extractorPromise = null;
  runtimeConfigured = false;
}
