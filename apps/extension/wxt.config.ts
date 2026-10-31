import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import svgr from "vite-plugin-svgr";
import { fileURLToPath } from "node:url";

// Absolute path to the installed transformers dist dir. Resolved relative to
// this config (apps/extension/) — pnpm symlinks the direct dependency into the
// app's own node_modules, so this URL points at apps/extension/node_modules/...
const ORT_DIST = fileURLToPath(
  new URL("node_modules/@huggingface/transformers/dist/", import.meta.url),
);
const ORT_FILES = [
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
];

export default defineConfig({
  modules: ["@wxt-dev/module-react", "@wxt-dev/auto-icons"],
  // Generate the manifest icons (Chrome + Firefox) from a single source — the
  // brand Mark in assets/icon.svg (mirrors packages/ui/src/Mark.tsx). 96 is
  // added to the module's defaults to match the sizes we shipped before.
  autoIcons: {
    baseIconPath: "../../packages/ui/src/mark.svg",
    sizes: [128, 96, 48, 32, 16],
  },
  // Don't auto-import from Storybook stories / tests. WXT scans components/ for
  // auto-imports; CSF story files re-export the same case names (Empty, Idle,
  // ErrorState, …) across files, which floods the build log with "Duplicated
  // imports" warnings. We import everything explicitly anyway — this only trims
  // the scan sources, WXT's built-in auto-imports (defineContentScript, browser)
  // are unaffected.
  imports: {
    dirsScanOptions: {
      fileFilter: (file) => !/\.(stories|test)\.[jt]sx?$/.test(file) && !/\s+\d+\.[jt]sx?$/.test(file),
    },
  },
  manifest: ({ browser }) => ({
    name: "CartSplit",
    description: "Categorize Amazon.ca purchases in YNAB. Your token and approved changes go directly to YNAB, never to the CartSplit developer.",
    // This fork has its own Firefox identity; never reuse upstream identity.
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: "cartsplit@mcgeeker",
              // Only the token and approved budget data leave for YNAB.
              // Model downloads disclose ordinary request metadata to HF/CDN;
              // product titles and category names are embedded on-device.
              data_collection_permissions: {
                required: ["authenticationInfo", "financialAndPaymentInfo"],
              },
            },
          },
        }
      : {}),
    // `sidePanel` is Chrome-only; including it on Firefox triggers an "Unknown
    // permission" load warning and an AMO review flag. Firefox uses
    // sidebar_action (auto-generated from the sidepanel entrypoint) instead.
    permissions: [
      "storage",
      "tabs",
      ...(browser === "firefox" ? [] : ["sidePanel"]),
    ],
    // transformers.js runs the embedding model via WebAssembly, which Chrome
    // MV3 blocks unless we explicitly opt in. `wasm-unsafe-eval` allows WASM
    // compilation only — it does NOT re-enable arbitrary eval().
    content_security_policy: {
      extension_pages: "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; base-uri 'none'; form-action 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.ynab.com https://huggingface.co https://*.huggingface.co https://*.hf.co",
    },
    host_permissions: [
      "https://app.ynab.com/*",        // read-only account-register order buttons
      "https://www.amazon.ca/*",       // explicitly selected Canadian page check
      "https://api.ynab.com/*",
      "https://huggingface.co/*",       // model metadata + resolve redirect
      "https://*.huggingface.co/*",     // legacy LFS CDN (cdn-lfs.huggingface.co)
      "https://*.hf.co/*",              // Xet model-file CDN (cas-bridge.xethub.hf.co)
    ],
  }),
  // Firefox's AMO review must be able to rebuild the add-on from source. This is
  // a pnpm monorepo — apps/extension depends on the @lineitem/ui workspace
  // package — so the sources ZIP has to span the whole repo (the app dir alone
  // can't `pnpm install`). Point sourcesRoot at the monorepo root so packages/ui,
  // pnpm-workspace.yaml, and pnpm-lock.yaml are included, and drop build outputs
  // that aren't needed to build (node_modules / hidden dirs / tests are already
  // excluded by WXT).
  zip: {
    sourcesRoot: fileURLToPath(new URL("../../", import.meta.url)),
    excludeSources: [
      "**/storybook-static/**",
      "apps/extension/store-assets/**",
      "**/dist/**",
      "**/coverage/**",
    ],
  },
  // Copy the ONNX runtime files into the build at /ort/ for BOTH browsers.
  // Firefox loads them via env.backends.onnx.wasm.wasmPaths (set in the
  // embedder); Chrome's bundled glue fetches the .wasm from here via the
  // de-inline base below. Either way ORT loads locally instead of from the
  // jsDelivr CDN, which the extension CSP `script-src 'self'` blocks.
  hooks: {
    "build:publicAssets"(_wxt, assets) {
      for (const f of ORT_FILES) {
        assets.push({ absoluteSrc: ORT_DIST + f, relativeDest: `ort/${f}` });
      }
    },
  },
  vite: () => ({
    plugins: [
      tailwindcss(),
      // Lets components import SVGs as React components via the `?react` query
      // (e.g. @lineitem/ui's Mark). Default include is **/*.svg?react, so plain
      // SVG URL imports (public/, assets/) are untouched.
      svgr(),
      // De-inline the 21 MB ORT wasm. The glue locates its binary with
      // `new URL("...jsep.wasm", import.meta.url)`, which Vite resolves and
      // inlines as a ~28.8 MB data: URI. Neutralize the pattern (enforce:"pre",
      // before Vite's asset plugin) so the binary is never inlined, and point
      // the lookup at the /ort/ files copied above. This base is what Chrome's
      // statically-bundled glue uses to FETCH the wasm (Chrome can't set
      // wasmPaths — that would force a service-worker-illegal dynamic import).
      // Firefox doesn't reach this line at runtime (it sets wasmPaths and loads
      // the standalone /ort/ .mjs instead), but the expression stays valid there.
      {
        name: "ort-no-inline-wasm",
        enforce: "pre" as const,
        transform(code: string, id: string) {
          if (
            !id.includes("ort-wasm-simd-threaded.jsep.mjs") &&
            !id.includes("ort.bundle.min.mjs")
          )
            return null;
          const PATTERN = 'new URL("ort-wasm-simd-threaded.jsep.wasm",import.meta.url)';
          const out = code.replaceAll(
            PATTERN,
            'new URL("ort-wasm-simd-threaded.jsep.wasm",(globalThis.chrome??globalThis.browser).runtime.getURL("ort/"))',
          );
          // Fail loudly if the upstream string drifts (e.g. an onnxruntime-web
          // bump changes whitespace/quoting): a silent no-op here re-inlines the
          // 21 MB wasm as a data: URI and balloons background.js back to ~56 MB
          // with no build error. Better a broken build than a 60x bundle.
          if (out === code) {
            throw new Error(
              `[ort-no-inline-wasm] expected ORT wasm-URL pattern not found in ${id}; ` +
                `onnxruntime-web likely changed — update PATTERN or the wasm will be re-inlined.`,
            );
          }
          return out;
        },
      },
    ],
  }),
});
