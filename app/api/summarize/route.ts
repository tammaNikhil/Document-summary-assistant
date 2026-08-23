import { NextRequest } from "next/server";
import { extractPdfText, extractScannedPdfPageImages } from "@/lib/extract-pdf";
import { extractTextFromImage, extractTextFromImages } from "@/lib/ocr";
import { getSummarizationProvider } from "@/lib/summarize";
import {
  ACCEPTED_MIME_TYPES,
  MAX_FILE_SIZE_MB,
  SummaryLength,
  SummarizeResponse,
} from "@/lib/types";

export const runtime = "nodejs";
// Scanned PDFs go through per-page OCR (see the "likelyScanned" branch
// below), which is slow enough that the old 60s budget wasn't enough
// headroom for anything but a single page. 300s is the maximum function
// duration Vercel's Hobby plan allows without opting into Fluid
// Compute's higher tiers, so it's the largest budget available without
// asking anyone deploying this to upgrade.
export const maxDuration = 300;

// How much of the request's total time budget the OCR loop itself is
// allowed to consume, once a scanned PDF's page images have been
// extracted. This leaves the remaining ~90s of the 300s budget for
// upstream work (reading the upload, the initial text-extraction pass,
// pulling embedded page images out of the PDF) and downstream work (the
// summarization call), so a many-page scanned PDF degrades to "OCR'd as
// much as we had time for" instead of blowing the whole request's timeout.
const SCANNED_PDF_OCR_DEADLINE_MS = 210_000;

function isValidLength(v: unknown): v is SummaryLength {
  return v === "short" || v === "medium" || v === "long";
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Streams newline-delimited JSON progress events rather than a single
 * response, so the client can show "reading your document" vs "writing
 * your summary" as two genuinely distinct, server-driven stages instead
 * of one generic spinner (or a client-side timer guessing at timing).
 *
 * Event shapes, one per line:
 *   {"stage":"extracting"}
 *   {"stage":"ocr","page":<number>,"totalPages":<number>}   (scanned PDFs only, one per page)
 *   {"stage":"summarizing"}
 *   {"stage":"done","result":<SummarizeResponse>}
 *   {"stage":"error","error":"<message>"}
 *
 * Validation failures that happen before any real work starts (bad file
 * type, no file, too large) are returned as plain JSON with a non-OK
 * status instead — no need to open a stream for something instant.
 */
export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonError("Could not read the upload. Please try again.", 400);
  }

  const file = formData.get("file");
  const lengthRaw = formData.get("length");

  if (!(file instanceof File)) {
    return jsonError("No file was uploaded.", 400);
  }

  const length: SummaryLength = isValidLength(lengthRaw) ? lengthRaw : "medium";

  if (!ACCEPTED_MIME_TYPES.includes(file.type as (typeof ACCEPTED_MIME_TYPES)[number])) {
    return jsonError("Unsupported file type. Please upload a PDF, JPG, PNG, or WEBP file.", 400);
  }

  const sizeMb = file.size / (1024 * 1024);
  if (sizeMb > MAX_FILE_SIZE_MB) {
    return jsonError(`File is too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`, 400);
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: Record<string, unknown>) {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      }

      try {
        send({ stage: "extracting" });

        let extractedText = "";
        let sourceType: "pdf" | "image";
        let usedOCR = false;
        let ocrPageInfo: SummarizeResponse["ocrPageInfo"];

        if (file.type === "application/pdf") {
          sourceType = "pdf";
          let pdfResult;
          try {
            pdfResult = await extractPdfText(buffer);
          } catch (pdfErr) {
            console.error("PDF extraction error:", pdfErr);
            send({ stage: "error", error: "Could not read this PDF. It may be corrupted or password-protected." });
            return;
          }

          if (pdfResult.likelyScanned) {
            usedOCR = true;

            let pageImages;
            try {
              pageImages = await extractScannedPdfPageImages(buffer, pdfResult.numPages);
            } catch (extractErr) {
              console.error("Scanned PDF page image extraction error:", extractErr);
              send({
                stage: "error",
                error:
                  "This PDF appears to be scanned, but its page images couldn't be extracted. " +
                  "It may be corrupted or use unsupported PDF features.",
              });
              return;
            }

            if (pageImages.images.length === 0) {
              send({
                stage: "error",
                error:
                  "This PDF appears to be scanned, but no page images could be found to run OCR on. " +
                  "Try exporting the pages as JPG/PNG images and uploading those instead.",
              });
              return;
            }

            const pageResults = await extractTextFromImages(pageImages.images, {
              deadlineMs: SCANNED_PDF_OCR_DEADLINE_MS,
              onPageStart: (pageNumber) =>
                send({ stage: "ocr", page: pageNumber, totalPages: pageImages.images.length }),
            });

            extractedText = pageResults
              .map((p) => p.text)
              .filter(Boolean)
              .join("\n\n");

            ocrPageInfo = {
              pagesProcessed: pageResults.length,
              totalPages: pdfResult.numPages,
            };
          } else {
            extractedText = pdfResult.text;
          }
        } else {
          sourceType = "image";
          usedOCR = true;
          try {
            extractedText = await extractTextFromImage(buffer);
          } catch (ocrErr) {
            console.error("OCR error:", ocrErr);
            const isTimeout = ocrErr instanceof Error && ocrErr.message === "OCR timed out";
            send({
              stage: "error",
              error: isTimeout
                ? "OCR took too long to process this image. This can happen intermittently — please try again."
                : "OCR failed to process this image. Try a clearer or higher-resolution image.",
            });
            return;
          }
        }

        if (!extractedText || extractedText.trim().length < 20) {
          let hint = "Try a different PDF.";
          if (sourceType === "image") {
            hint = "Try a clearer image with more visible text.";
          } else if (usedOCR) {
            hint = "Try a higher-resolution scan, or make sure the pages aren't blank or upside down.";
          }
          send({
            stage: "error",
            error: `Not enough readable text was found in this document. ${hint}`,
          });
          return;
        }

        send({ stage: "summarizing" });

        let result;
        try {
          const provider = getSummarizationProvider();
          result = await provider.summarize(extractedText, length);
        } catch (err) {
          console.error("Summarization error:", err);
          send({ stage: "error", error: "The summarization service failed. Please try again in a moment." });
          return;
        }

        const response: SummarizeResponse = {
          summary: result.summary,
          keyPoints: result.keyPoints,
          improvementSuggestions: result.improvementSuggestions,
          length,
          sourceType,
          usedOCR,
          extractedCharCount: extractedText.length,
          ocrPageInfo,
        };

        send({ stage: "done", result: response });
      } catch (err) {
        console.error("Unexpected error in /api/summarize:", err);
        send({ stage: "error", error: "Something went wrong processing your document. Please try again." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
