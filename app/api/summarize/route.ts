import { NextRequest, NextResponse } from "next/server";
import { extractPdfText } from "@/lib/extract-pdf";
import { extractTextFromImage } from "@/lib/ocr";
import { getSummarizationProvider } from "@/lib/summarize";
import {
  ACCEPTED_MIME_TYPES,
  MAX_FILE_SIZE_MB,
  SummaryLength,
  SummarizeResponse,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function isValidLength(v: unknown): v is SummaryLength {
  return v === "short" || v === "medium" || v === "long";
}

function getSummarizationErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  const provider = (process.env.SUMMARIZATION_PROVIDER || "groq").toLowerCase();

  if (message.includes("is not set")) {
    const keyName =
      provider === "openai"
        ? "OPENAI_API_KEY"
        : provider === "anthropic"
          ? "ANTHROPIC_API_KEY"
          : "GROQ_API_KEY";

    return (
      `The server summarization provider is not configured. ` +
      `Add ${keyName} in your deployment environment variables and redeploy.`
    );
  }

  if (/\bAPI error \(401\)|\bAPI error \(403\)/.test(message)) {
    return (
      "The summarization provider rejected the configured API key or request. " +
      "Check your deployment environment variables and provider settings."
    );
  }

  if (message.includes("model_not_found") || /\bAPI error \(404\)/.test(message)) {
    return (
      "The configured summarization model is unavailable for this provider account. " +
      "Update the model setting or redeploy with a currently supported model."
    );
  }

  if (/\bAPI error \(429\)/.test(message)) {
    return "The summarization provider is rate-limiting requests right now. Please try again shortly.";
  }

  if (/\bAPI error \(5\d\d\)/.test(message)) {
    return "The summarization provider is temporarily unavailable. Please try again in a moment.";
  }

  return "The summarization service failed. Please try again in a moment.";
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const lengthRaw = formData.get("length");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
    }

    const length: SummaryLength = isValidLength(lengthRaw) ? lengthRaw : "medium";

    if (!ACCEPTED_MIME_TYPES.includes(file.type as (typeof ACCEPTED_MIME_TYPES)[number])) {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload a PDF, JPG, PNG, or WEBP file." },
        { status: 400 }
      );
    }

    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > MAX_FILE_SIZE_MB) {
      return NextResponse.json(
        { error: `File is too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.` },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let extractedText = "";
    let sourceType: "pdf" | "image";
    let usedOCR = false;

    if (file.type === "application/pdf") {
      sourceType = "pdf";
      let pdfResult;
      try {
        pdfResult = await extractPdfText(buffer);
      } catch (pdfErr) {
        console.error("PDF extraction error:", pdfErr);
        return NextResponse.json(
          { error: "Could not read this PDF. It may be corrupted or password-protected." },
          { status: 422 }
        );
      }

      if (pdfResult.likelyScanned) {
        return NextResponse.json(
          {
            error:
              "This PDF appears to be scanned or image-based, with little to no selectable text. " +
              "OCR on scanned PDFs isn't supported directly in this MVP — please export the pages as " +
              "JPG/PNG images and upload those instead so OCR can run on them.",
          },
          { status: 422 }
        );
      }
      extractedText = pdfResult.text;
    } else {
      sourceType = "image";
      usedOCR = true;
      try {
        extractedText = await extractTextFromImage(buffer);
      } catch {
        return NextResponse.json(
          { error: "OCR failed to process this image. Try a clearer or higher-resolution image." },
          { status: 422 }
        );
      }
    }

    if (!extractedText || extractedText.trim().length < 20) {
      return NextResponse.json(
        {
          error:
            "Not enough readable text was found in this document. " +
            (sourceType === "image"
              ? "Try a clearer image with more visible text."
              : "Try a different PDF."),
        },
        { status: 422 }
      );
    }

    let result;
    try {
      const provider = getSummarizationProvider();
      result = await provider.summarize(extractedText, length);
    } catch (err) {
      console.error("Summarization error:", err);
      const errorMessage = getSummarizationErrorMessage(err);
      const status = errorMessage.includes("not configured") ? 500 : 502;
      return NextResponse.json({ error: errorMessage }, { status });
    }

    const response: SummarizeResponse = {
      summary: result.summary,
      keyPoints: result.keyPoints,
      length,
      sourceType,
      usedOCR,
      extractedCharCount: extractedText.length,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    console.error("Unexpected error in /api/summarize:", err);
    return NextResponse.json(
      { error: "Something went wrong processing your document. Please try again." },
      { status: 500 }
    );
  }
}
