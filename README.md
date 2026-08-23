# Document Summary Assistant

Upload a PDF or image document and get an AI-generated summary — short, medium, or long — plus a list of key points. Built as a single Next.js app: no separate backend, no database, no auth.

**Live URL:** https://document-summary-assistant-sepia-five.vercel.app/

---

## How it works

<img width="803" height="728" alt="image" src="https://github.com/user-attachments/assets/8b3c53d6-f21a-4c30-93e9-6f9516ec96ea" />



### PDF extraction

Uses [`pdf-parse`](https://www.npmjs.com/package/pdf-parse) (v2), which reads embedded text from the PDF's content streams — the same text you'd get by selecting and copying it in a PDF viewer. This works well for normal, text-based PDFs (reports, exports, most documents).

Standard text extraction doesn't work for scanned PDFs (i.e. a PDF that's really just a photo of a page, with no embedded text layer) — the app detects this case (extracted text under ~20 characters per page implies the PDF is scanned) and falls back to rendering + OCR instead, described next.

### OCR

Uses [`Tesseract.js`](https://tesseract.projectnaptha.com/) — a real, open-source OCR engine (WASM build of Tesseract), not a mocked or stubbed feature. It runs server-side in the API route. No API key or paid service required.

Two paths feed into it:
- **Image uploads** (JPG/PNG/WEBP) go straight to Tesseract.js.
- **Scanned PDFs** have each page's embedded scan image pulled out directly via `pdf-parse`'s `getImage()` (which reads the image bytes straight from the PDF's object streams — no page rendering/rasterization involved), then each page image goes through Tesseract.js in turn, and the recognized text is concatenated. This deliberately avoids rendering pages through canvas: an earlier version used `getScreenshot()` for this, which hit a real production bug — `pdfjs-dist` drawing content onto `@napi-rs/canvas` under Next.js/Turbopack's bundling triggered `Error: Value is none of these types \`String\`, \`Path\`` / `InvalidArg` from the native binding (a module-duplication issue between the bundler and the native canvas binding's `instanceof` checks — see the comment above `extractScannedPdfPageImages` in `lib/extract-pdf.ts` for the full explanation and a link to the upstream issue). Since a scanned PDF's page is structurally just one embedded photo, extracting it directly sidesteps rendering — and, therefore, that bug — entirely.

Because OCR-ing a whole PDF page-by-page is slower than OCR-ing one image, a scanned PDF is capped at `MAX_SCANNED_PDF_PAGES` (10 by default, see `lib/extract-pdf.ts`) and the OCR loop has its own internal time budget (`SCANNED_PDF_OCR_DEADLINE_MS` in the API route) so a long scanned document degrades gracefully — summarized on however many pages it had time to read — rather than timing out the whole request. If a document is truncated this way, the UI and the downloadable PDF both say so. In the rare case a "likely scanned" PDF doesn't actually have simple embedded page images (e.g. non-standard PDF structure), the app says so explicitly and suggests exporting pages as JPG/PNG and uploading those instead.

### Summarization

Uses an LLM (Groq's hosted Llama 3.3 70B by default) with a prompt that asks for a length-appropriate summary plus 3–6 key points, returned as strict JSON. The provider is swappable — `lib/summarize.ts` defines a small interface with three implementations (Groq, OpenAI, Anthropic), selected via the `SUMMARIZATION_PROVIDER` environment variable. Swapping providers later means adding a new class in that file, not rewriting the app.

Groq is the default because its free tier requires no credit card and is fast — good fit for a take-home assessment.

### Frontend

Plain React state in `app/page.tsx` (no external state library — there's exactly one screen and one async operation, so `useState` is enough). Tailwind CSS for styling, mobile-first: the upload area, length selector, and result view all reflow to a single column on small screens, and the layout is tested down to narrow phone widths.

---

## Project structure

```
app/
  page.tsx                   UI: upload → length selector → result / error / reset
  layout.tsx                 metadata + mobile viewport
  globals.css                design tokens
  api/summarize/route.ts     the only API endpoint
components/
  UploadArea.tsx             drag-drop + file picker
  LengthSelector.tsx         short / medium / long
  SummaryResult.tsx          summary + highlighted key points
  StatusBanners.tsx          loading + error UI
lib/
  types.ts                   shared types + config constants
  extract-pdf.ts             PDF text extraction + embedded page-image extraction (for scanned PDFs)
  ocr.ts                     image OCR (single image, and multi-page for scanned PDFs)
  summarize.ts               summarization provider abstraction
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
- Scanned PDF whose page images can't be extracted (corrupted, unsupported PDF features, or no embedded page images found)
- OCR failure on an image or a scanned PDF page
- Extracted text too short to summarize meaningfully
- Summarization API failure (bad key, rate limit, network) → surfaced as a clean error, not a crash

## Known limitations

- **Scanned PDFs are capped at `MAX_SCANNED_PDF_PAGES` pages (10 by default)** — OCR-ing a whole PDF page-by-page is slow, so only the first N pages are rendered and OCR'd; longer documents are summarized on however much was processed, with a note in the UI and downloadable PDF that it was truncated. Raise the constant in `lib/extract-pdf.ts` if you need more (and raise `SCANNED_PDF_OCR_DEADLINE_MS` / `maxDuration` in the API route to match — see the comments there for the time budget this needs to fit in).
- **Upload size is capped low by default (4MB)** to stay under Vercel's Hobby-tier request body limit (~4.5MB). If you deploy elsewhere or upgrade to Vercel Pro, raise `MAX_FILE_SIZE_MB`.

