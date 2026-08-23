import { createWorker } from "tesseract.js";

// OCR for image uploads (JPG/PNG/WEBP) using Tesseract.js.
// Runs server-side in the API route. No API key required — this is
// genuinely free, not just free-tier.
//
// Two defensive measures here, both aimed at the same failure mode:
// Tesseract.js downloading language data over the network can fail or
// stall in ways that don't surface as a normal rejected promise. Left
// unhandled, that means the request just hangs until the *platform's*
// timeout kills it (a raw 504 with no message). Neither of these
// changes affects a normal successful run.
//
// 1. cachePath: on Vercel (and most serverless platforms) only /tmp is
//    writable — the function's own directory is read-only. Tesseract
//    tries to cache downloaded language data to disk by default; a
//    failed write there can hang rather than error cleanly.
//
// 2. A manual timeout: some Tesseract-internal failures surface as an
//    uncaught exception rather than a rejected promise, which would
//    otherwise crash the function ungracefully. Racing the recognition
//    call against our own timeout guarantees we always return a clean,
//    actionable JSON error well before Vercel's own function timeout
//    (60s, configured in the API route) would kick in instead.
const OCR_TIMEOUT_MS = 45_000;

export async function extractTextFromImage(buffer: Buffer): Promise<string> {
  let workerError: unknown = null;
  let timeoutHandle: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error("OCR timed out")),
      OCR_TIMEOUT_MS
    );
  });

  // createWorker() itself downloads and initializes language data —
  // that's the step that actually hangs on a stalled network, not
  // recognize(). The whole flow needs to race against the timeout,
  // not just the recognition call.
  const run = async () => {
    const worker = await createWorker("eng", 1, {
      cachePath: "/tmp",
      logger: (m) => console.log("[tesseract]", JSON.stringify(m)),
      errorHandler: (err) => {
        workerError = err;
      },
    });
    try {
      const result = await worker.recognize(buffer);
      if (workerError) throw workerError;
      return (result.data.text || "").trim();
    } finally {
      // Don't let a hung worker's own termination hang this handler too.
      await Promise.race([
        worker.terminate(),
        new Promise((resolve) => setTimeout(resolve, 5_000)),
      ]);
    }
  };

  try {
    return await Promise.race([run(), timeout]);
  } finally {
    clearTimeout(timeoutHandle!);
  }
}
