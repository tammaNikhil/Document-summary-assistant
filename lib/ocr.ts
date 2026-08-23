import { createWorker, Worker } from "tesseract.js";

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

// OCR for scanned PDFs, run page-by-page over images rendered from the
// PDF (see lib/extract-pdf.ts renderPdfPagesToImages).
//
// This deliberately does NOT reuse extractTextFromImage() above by
// calling it once per page. createWorker() re-downloads/re-initializes
// Tesseract's language data every time it's called, which is fine for a
// single-image upload but would multiply that startup cost by the page
// count here — for a 10-page scanned PDF that's the difference between
// one ~2-5s init and ten of them. Instead we create one worker and reuse
// it across all pages, paying the init cost once.
//
// Two timeouts, for two different failure modes:
// - OCR_WORKER_INIT_TIMEOUT_MS bounds worker creation (language data
//   download), same rationale as the single-image path.
// - OCR_PAGE_TIMEOUT_MS bounds each individual page's recognition. If
//   one page hangs, we skip it and move on rather than losing the whole
//   document's worth of OCR to a single bad page.
//
// A caller-supplied deadline additionally bounds the whole loop: once
// elapsed time passes deadlineMs, we stop *starting* new pages (already
// in-flight pages are left to finish or hit their own timeout) and
// return whatever's been recognized so far. This exists because the
// route handler has its own overall time budget (see maxDuration in
// app/api/summarize/route.ts) that also needs to leave room for
// rendering the pages in the first place and for the summarization call
// afterward — a scanned PDF with many pages should degrade to "OCR'd as
// much as we had time for" rather than timing out the whole request.
const OCR_WORKER_INIT_TIMEOUT_MS = 45_000;
const OCR_PAGE_TIMEOUT_MS = 30_000;

export interface PageOcrResult {
  pageNumber: number;
  text: string;
}

export interface MultiPageOcrOptions {
  /** Stop starting new pages once this many ms have elapsed since the call began. */
  deadlineMs?: number;
  /** Called right before each page's recognition starts, for progress reporting. */
  onPageStart?: (pageNumber: number, index: number, total: number) => void;
}

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutHandle!));
}

async function terminateWorkerSafely(worker: Worker) {
  // Same reasoning as the single-image path: don't let a hung worker's
  // own termination hang the caller too.
  await Promise.race([
    worker.terminate(),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
}

export async function extractTextFromImages(
  pages: { pageNumber: number; data: Buffer }[],
  options: MultiPageOcrOptions = {}
): Promise<PageOcrResult[]> {
  const deadlineMs = options.deadlineMs ?? Infinity;
  const startedAt = Date.now();

  let workerError: unknown = null;
  const worker = await withTimeout(
    createWorker("eng", 1, {
      cachePath: "/tmp",
      logger: (m) => console.log("[tesseract]", JSON.stringify(m)),
      errorHandler: (err) => {
        workerError = err;
      },
    }),
    OCR_WORKER_INIT_TIMEOUT_MS,
    "OCR timed out"
  );

  const results: PageOcrResult[] = [];
  try {
    for (let i = 0; i < pages.length; i++) {
      if (Date.now() - startedAt > deadlineMs) break;

      const page = pages[i];
      options.onPageStart?.(page.pageNumber, i, pages.length);

      try {
        if (workerError) throw workerError;
        const result = await withTimeout(
          worker.recognize(page.data),
          OCR_PAGE_TIMEOUT_MS,
          "OCR timed out"
        );
        if (workerError) throw workerError;
        results.push({ pageNumber: page.pageNumber, text: (result.data.text || "").trim() });
      } catch (err) {
        
        console.error(`OCR failed on page ${page.pageNumber}:`, err);
        results.push({ pageNumber: page.pageNumber, text: "" });
      }
    }
    return results;
  } finally {
    await terminateWorkerSafely(worker);
  }
}
