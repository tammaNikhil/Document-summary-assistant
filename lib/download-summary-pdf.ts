import { SummarizeResponse } from "./types";

const MARGIN = 20;
const PAGE_WIDTH = 210; // A4, mm
const PAGE_HEIGHT = 297;
const USABLE_WIDTH = PAGE_WIDTH - MARGIN * 2;

const INK: [number, number, number] = [27, 42, 74]; // matches --ink
const MUTED: [number, number, number] = [107, 114, 128]; // matches --muted

/**
 * Renders the current summary result as a simple PDF and triggers a
 * browser download. jsPDF is dynamically imported so its ~200KB doesn't
 * ship in the main page bundle — it only loads when someone actually
 * clicks "download".
 */
export async function downloadSummaryPdf(result: SummarizeResponse) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGIN;

  function ensureSpace(lineHeight: number) {
    if (y + lineHeight > PAGE_HEIGHT - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  }

  function heading(text: string) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    ensureSpace(6);
    doc.text(text.toUpperCase(), MARGIN, y);
    y += 7;
  }

  function paragraph(text: string, size = 11, lineHeight = 6, gapAfter = 8) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(text, USABLE_WIDTH);
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, MARGIN, y);
      y += lineHeight;
    }
    y += gapAfter;
  }

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...INK);
  ensureSpace(9);
  doc.text("Document Summary", MARGIN, y);
  y += 9;

  // Meta line: source type, length, OCR flag, char count, date
  const meta = [
    result.sourceType === "pdf" ? "PDF" : "Image",
    result.usedOCR ? "OCR applied" : null,
    `${result.length} summary`,
    `${result.extractedCharCount.toLocaleString()} characters read`,
    new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
  ]
    .filter(Boolean)
    .join("   ·   ");
  paragraph(meta, 9, 5, 8);

  // Summary
  heading("Summary");
  paragraph(result.summary);

  // Key points
  if (result.keyPoints.length > 0) {
    heading("Key points");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...INK);

    result.keyPoints.forEach((point, i) => {
      const label = `${i + 1}.`;
      const indent = 8;
      const wrapped = doc.splitTextToSize(point, USABLE_WIDTH - indent);
      wrapped.forEach((line: string, idx: number) => {
        ensureSpace(6);
        if (idx === 0) {
          doc.text(label, MARGIN, y);
        }
        doc.text(line, MARGIN + indent, y);
        y += 6;
      });
      y += 2;
    });
  }

  const filename = `document-summary-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
