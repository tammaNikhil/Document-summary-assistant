import { createWorker } from "tesseract.js";

// OCR for image uploads (JPG/PNG/WEBP) using Tesseract.js.
// Runs server-side in the API route. No API key required — this is
// genuinely free, not just free-tier.
export async function extractTextFromImage(buffer: Buffer): Promise<string> {
  const worker = await createWorker("eng");
  try {
    const {
      data: { text },
    } = await worker.recognize(buffer);
    return (text || "").trim();
  } finally {
    await worker.terminate();
  }
}
