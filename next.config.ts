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
