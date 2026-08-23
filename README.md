# Document Summary Assistant

Upload a PDF or image document and get an AI-generated summary — short, medium, or long — plus a list of key points. Built as a single Next.js app: no separate backend, no database, no auth.

**Live URL:** _add after deploying (see Batch E)_
**Repo:** _add your GitHub URL here_

---

## How it works

```
Browser
  │  drag/drop or file picker
  ▼
POST /api/summarize  (file + length preference)
  │
  ├─ PDF?   → pdf-parse extracts text
  │            │
  │            └─ text too sparse per page? → likely a scanned PDF —
  │               render its pages to images (pdf-parse getScreenshot)
  │               and run each one through Tesseract.js OCR instead
  │
  └─ Image? → Tesseract.js OCR extracts text
  │
  ▼
Extracted text → summarization provider (Groq by default)
  │
  ▼
{ summary, keyPoints[] } → rendered in the UI
```

Everything happens per-request, in memory. Nothing is stored or persisted.

### PDF extraction

Uses [`pdf-parse`](https://www.npmjs.com/package/pdf-parse) (v2), which reads embedded text from the PDF's content streams — the same text you'd get by selecting and copying it in a PDF viewer. This works well for normal, text-based PDFs (reports, exports, most documents).

Standard text extraction doesn't work for scanned PDFs (i.e. a PDF that's really just a photo of a page, with no embedded text layer) — the app detects this case (extracted text under ~20 characters per page implies the PDF is scanned) and falls back to rendering + OCR instead, described next.

### OCR

Uses [`Tesseract.js`](https://tesseract.projectnaptha.com/) — a real, open-source OCR engine (WASM build of Tesseract), not a mocked or stubbed feature. It runs server-side in the API route. No API key or paid service required.

Two paths feed into it:
- **Image uploads** (JPG/PNG/WEBP) go straight to Tesseract.js.
- **Scanned PDFs** are first rendered to page images via `pdf-parse`'s `getScreenshot()` (built on `pdfjs-dist`, the same engine used for text extraction), then each page image goes through Tesseract.js in turn, and the recognized text is concatenated. This reuses the `@napi-rs/canvas` polyfill already wired up for text extraction, so it doesn't add any new native dependency or Poppler-style binary — the exact thing that made scanned-PDF OCR fragile on serverless hosting is already solved here.

Because OCR-ing a whole PDF page-by-page is slower than OCR-ing one image, a scanned PDF is capped at `MAX_SCANNED_PDF_PAGES` (10 by default, see `lib/extract-pdf.ts`) and the OCR loop has its own internal time budget (`SCANNED_PDF_OCR_DEADLINE_MS` in the API route) so a long scanned document degrades gracefully — summarized on however many pages it had time to read — rather than timing out the whole request. If a document is truncated this way, the UI and the downloadable PDF both say so.

### Summarization

Uses an LLM (Groq's hosted Llama 3.3 70B by default) with a prompt that asks for a length-appropriate summary plus 3–6 key points, returned as strict JSON. The provider is swappable — `lib/summarize.ts` defines a small interface with three implementations (Groq, OpenAI, Anthropic), selected via the `SUMMARIZATION_PROVIDER` environment variable. Swapping providers later means adding a new class in that file, not rewriting the app.

Groq is the default because its free tier requires no credit card and is fast — good fit for a take-home assessment.

### Frontend

Plain React state in `app/page.tsx` (no external state library — there's exactly one screen and one async operation, so `useState` is enough). Tailwind CSS for styling, mobile-first: the upload area, length selector, and result view all reflow to a single column on small screens, and the layout is tested down to narrow phone widths.

---

## Project structure

```
app/
  page.tsx                  UI: upload → length selector → result / error / reset
  layout.tsx                 metadata + mobile viewport
  globals.css                 design tokens
  api/summarize/route.ts     the only API endpoint
components/
  UploadArea.tsx             drag-drop + file picker
  LengthSelector.tsx         short / medium / long
  SummaryResult.tsx          summary + highlighted key points
  StatusBanners.tsx          loading + error UI
lib/
  types.ts                    shared types + config constants
  extract-pdf.ts               PDF text extraction + page-to-image rendering (for scanned PDFs)
  ocr.ts                       image OCR (single image, and multi-page for scanned PDFs)
  summarize.ts                  summarization provider abstraction
```

---

## Running locally

Requires Node.js 18+.

```bash
npm install
cp .env.example .env.local
# edit .env.local and paste in a GROQ_API_KEY (free, no card — console.groq.com)
npm run dev
```

Open `http://localhost:3000`.

## Deploying

Deploys as a standard Next.js app on Vercel (or any Node hosting that supports Next.js API routes). See the deployment guide for the exact click-by-click steps, or in short:

1. Push this repo to GitHub.
2. Import it in Vercel.
3. Add the environment variables from `.env.example` in the Vercel project settings.
4. Deploy.

---

## Error handling

Every failure path returns a specific, actionable message rather than a generic "something went wrong":
- Wrong file type → named, with the accepted types listed
- No file selected
- File over the size limit → limit stated
- Corrupted/unreadable PDF
- Scanned PDF whose pages can't be rendered (corrupted, unsupported PDF features)
- OCR failure on an image or a scanned PDF page
- Extracted text too short to summarize meaningfully
- Summarization API failure (bad key, rate limit, network) → surfaced as a clean error, not a crash

## Known limitations

- **Scanned PDFs are capped at `MAX_SCANNED_PDF_PAGES` pages (10 by default)** — OCR-ing a whole PDF page-by-page is slow, so only the first N pages are rendered and OCR'd; longer documents are summarized on however much was processed, with a note in the UI and downloadable PDF that it was truncated. Raise the constant in `lib/extract-pdf.ts` if you need more (and raise `SCANNED_PDF_OCR_DEADLINE_MS` / `maxDuration` in the API route to match — see the comments there for the time budget this needs to fit in).
- **Upload size is capped low by default (4MB)** to stay under Vercel's Hobby-tier request body limit (~4.5MB). If you deploy elsewhere or upgrade to Vercel Pro, raise `MAX_FILE_SIZE_MB`.
- **No persistence** — summaries aren't saved. Refreshing the page clears the result. This is intentional for an assessment-scope MVP; adding storage would mean adding a database, which the brief doesn't call for.
- **Single OCR language (English)** — Tesseract.js is loaded with the `eng` model only. Other languages would need additional traineddata bundled in. This applies to scanned PDFs too.
- **No automated test suite** — testing was done manually against the scenarios listed in the original brief (see write-up); given the 8-hour scope, that was prioritized over building test infrastructure.
