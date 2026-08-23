import { SummarizeResponse } from "./types";

type Theme = "light" | "dark";
type RGB = [number, number, number];

const MARGIN = 20;
const PAGE_WIDTH = 210; // A4, mm
const PAGE_HEIGHT = 297;
const USABLE_WIDTH = PAGE_WIDTH - MARGIN * 2;

const PALETTE: Record<Theme, { bg: RGB; ink: RGB; muted: RGB; highlight: RGB; highlightText: RGB }> = {
  light: {
    bg: [255, 255, 255],
    ink: [27, 42, 74], // --ink
    muted: [107, 114, 128], // --muted
    highlight: [215, 232, 107], // --highlighter
    highlightText: [27, 42, 74], // --highlighter-text
  },
  dark: {
    bg: [0, 0, 0], // --paper
    ink: [242, 242, 240], // --ink
    muted: [138, 138, 138], // --muted
    highlight: [77, 90, 31], // --highlighter
    highlightText: [242, 242, 240], // --highlighter-text
  },
};

// jsPDF's built-in fonts only render the WinAnsi (Windows-1252) character
// set. Anything outside it — arrows, checkmarks, emoji, most symbols —
// doesn't get skipped, it gets silently decoded as the wrong glyph,
// which is what shows up as "inconsistent" or garbled-looking text.
// Rather than embedding a whole extra font just to cover a handful of
// symbols (and emoji can't be embedded in a text font at all), common
// ones are swapped for a plain-text equivalent and anything left
// unsupported is dropped, so every character that reaches the page
// renders in the same, correct font.
const SYMBOL_REPLACEMENTS: [RegExp, string][] = [
  [/[\u2192\u21d2]/g, "->"], // → ⇒
  [/[\u2190\u21d0]/g, "<-"], // ← ⇐
  [/\u2191/g, "up"], // ↑
  [/\u2193/g, "down"], // ↓
  [/[\u2713\u2714]/g, "[done]"], // ✓ ✔
  [/[\u2717\u2718\u274c]/g, "[not done]"], // ✗ ✘ ❌
  [/[\u25e6\u2023\u25aa\u25cf]/g, "-"], // other bullet variants
];

// The WinAnsi codepage's "special" characters above the Latin-1 range —
// smart quotes, en/em dash, ellipsis, bullet, trademark, etc. jsPDF's
// standard fonts do support these specifically, so they're kept as-is.
const WINANSI_SPECIALS = new Set(
  "\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178".split("")
);

function isPdfSafeChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  if (code === 9 || code === 10 || code === 13) return true; // tab / newline / CR
  if (code >= 0x20 && code <= 0x7e) return true; // ASCII printable
  if (code >= 0xa0 && code <= 0xff) return true; // Latin-1 supplement
  return WINANSI_SPECIALS.has(ch);
}

function sanitizeForPdf(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SYMBOL_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  out = Array.from(out).filter(isPdfSafeChar).join("");
  return out.replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * Renders the current summary result as a PDF matching the app's active
 * theme, and triggers a browser download. jsPDF is dynamically imported
 * so its ~200KB doesn't ship in the main page bundle — it only loads
 * when someone actually clicks "download".
 */
export async function downloadSummaryPdf(result: SummarizeResponse, theme: Theme = "light") {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const colors = PALETTE[theme];
  let y = MARGIN;

  function paintPageBackground() {
    if (theme === "dark") {
      doc.setFillColor(...colors.bg);
      doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
    }
  }

  function ensureSpace(lineHeight: number) {
    if (y + lineHeight > PAGE_HEIGHT - MARGIN) {
      doc.addPage();
      paintPageBackground();
      y = MARGIN;
    }
  }

  function heading(text: string) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...colors.muted);
    ensureSpace(6);
    doc.text(text.toUpperCase(), MARGIN, y);
    y += 7;
  }

  function paragraph(text: string, size = 11, lineHeight = 6, gapAfter = 8) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(...colors.ink);
    const lines = doc.splitTextToSize(sanitizeForPdf(text), USABLE_WIDTH);
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, MARGIN, y);
      y += lineHeight;
    }
    y += gapAfter;
  }

  paintPageBackground();

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...colors.ink);
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
    .join("   \u00b7   ");
  paragraph(meta, 9, 5, result.ocrPageInfo ? 2 : 8);

  if (result.ocrPageInfo && result.ocrPageInfo.pagesProcessed < result.ocrPageInfo.totalPages) {
    doc.setTextColor(...colors.muted);
    paragraph(
      `OCR processed the first ${result.ocrPageInfo.pagesProcessed} of ${result.ocrPageInfo.totalPages} pages in this scanned PDF.`,
      9,
      5,
      8
    );
  }

  // Summary
  heading("Summary");
  paragraph(result.summary);

  // Key points — rendered with the same highlighter-mark treatment used
  // on screen, so the export actually looks like the app, not just a
  // color-inverted copy of it.
  if (result.keyPoints.length > 0) {
    heading("Key points");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    result.keyPoints.forEach((rawPoint, i) => {
      const point = sanitizeForPdf(rawPoint);
      const label = `${i + 1}.`;
      const indent = 8;
      const wrapped: string[] = doc.splitTextToSize(point, USABLE_WIDTH - indent);

      wrapped.forEach((line, idx) => {
        ensureSpace(7);
        if (idx === 0) {
          doc.setTextColor(...colors.muted);
          doc.text(label, MARGIN, y);
        }
        // Highlighter block behind the line, mirroring .highlight-mark
        const textX = MARGIN + indent;
        const lineWidth = doc.getTextWidth(line);
        doc.setFillColor(...colors.highlight);
        doc.rect(textX - 1, y - 4.2, lineWidth + 2, 5.6, "F");
        doc.setTextColor(...colors.highlightText);
        doc.text(line, textX, y);
        y += 7;
      });
      y += 1.5;
    });
  }

  // Improvement suggestions — plain bullets, not highlighted, since these
  // are the assistant's own commentary rather than content pulled from
  // the document (matches the visual distinction used on screen).
  if (result.improvementSuggestions.length > 0) {
    y += 2;
    heading("Ways to improve this document");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...colors.ink);

    const indent = 6;
    result.improvementSuggestions.forEach((raw) => {
      const text = sanitizeForPdf(raw);
      const wrapped: string[] = doc.splitTextToSize(text, USABLE_WIDTH - indent);
      wrapped.forEach((line, idx) => {
        ensureSpace(6);
        if (idx === 0) {
          doc.setFillColor(...colors.muted);
          doc.circle(MARGIN + 1, y - 1.5, 0.7, "F");
        }
        doc.setTextColor(...colors.ink);
        doc.text(line, MARGIN + indent, y);
        y += 6;
      });
      y += 1.5;
    });
  }

  const filename = `document-summary-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
