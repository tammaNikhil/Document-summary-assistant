import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
      "./node_modules/tesseract.js/src/**",
      "./node_modules/tesseract.js/dist/**",
      "./node_modules/tesseract.js-core/**",
      "./node_modules/wasm-feature-detect/**",
    ],
  },
};

export default nextConfig;
