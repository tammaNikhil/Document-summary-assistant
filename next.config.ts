import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (pdfjs-dist) and tesseract.js load worker/wasm/traineddata
  // files from disk at runtime rather than importing them as normal JS.
  // Two things are needed for this to survive a Vercel deployment:
  //
  // 1. serverExternalPackages keeps these packages as real `require()`
  //    calls instead of letting webpack/Turbopack inline them, so Node's
  //    normal module resolution can find files on disk.
  //
  // 2. outputFileTracingIncludes forces Vercel's build-time file tracer
  //    to actually ship those worker files into the deployed function.
  //    Without this, tracing can miss them (they're loaded via a
  //    dynamically-constructed path, which static analysis can't always
  //    follow), and the file is silently absent at runtime in production
  //    even though it works locally where the full node_modules folder
  //    is present on disk.
  serverExternalPackages: [
    "pdf-parse",
    "pdfjs-dist",
    "tesseract.js",
    "tesseract.js-core",
    "@napi-rs/canvas",
  ],
  outputFileTracingIncludes: {
    "/api/summarize": [
      "./node_modules/pdfjs-dist/**/*.mjs",
      "./node_modules/pdfjs-dist/**/*.js",
      "./node_modules/@napi-rs/canvas/**",
      "./node_modules/@napi-rs/canvas-*/**",
      // Tesseract.js spawns a Node worker_thread whose script path, and
      // which of several WASM engine variants it loads (chosen by CPU
      // feature detection AT RUNTIME), can't be determined by static
      // build-time analysis. Vercel's file tracer silently drops files
      // it can't trace this way — the deployed function then hangs
      // waiting on a worker that fails to start, instead of erroring.
      // Including these trees wholesale sidesteps that guesswork.
      "./node_modules/tesseract.js/src/**",
      "./node_modules/tesseract.js/dist/**",
      "./node_modules/tesseract.js-core/**",
      "./node_modules/wasm-feature-detect/**",
      // Tesseract.js's own runtime dependencies (from its package.json).
      // Same tracing blind spot applies to these — confirmed in
      // production by a "Cannot find module 'bmp-js'" crash even after
      // the fix above, once the worker itself successfully started.
      "./node_modules/bmp-js/**",
      "./node_modules/idb-keyval/**",
      "./node_modules/is-url/**",
      "./node_modules/node-fetch/**",
      "./node_modules/regenerator-runtime/**",
      "./node_modules/zlibjs/**",
    ],
  },
};

export default nextConfig;
