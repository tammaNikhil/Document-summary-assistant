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
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "tesseract.js", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/summarize": [
      "./node_modules/pdfjs-dist/**/*.mjs",
      "./node_modules/pdfjs-dist/**/*.js",
      "./node_modules/@napi-rs/canvas/**",
      "./node_modules/@napi-rs/canvas-*/**",
    ],
  },
};

export default nextConfig;
