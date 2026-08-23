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
  │            └─ text too sparse per page? → likely a scanned PDF,
  │               return a clear error (see "Known limitations")
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

It does **not** work for scanned PDFs (i.e. a PDF that's really just a photo of a page, with no embedded text layer). The app detects this case — if the extracted text is under ~20 characters per page, it assumes the PDF is scanned — and returns an explicit error rather than silently producing a garbage or empty summary.

### OCR

Uses [`Tesseract.js`](https://tesseract.projectnaptha.com/) — a real, open-source OCR engine (WASM build of Tesseract), not a mocked or stubbed feature. It runs server-side in the API route, on JPG, PNG, and WEBP uploads. No API key or paid service required.

**Scanned PDFs are not OCR'd.** Doing that properly means rendering each PDF page to an image first, which needs a rasterization dependency (e.g. a `canvas` binding or a Poppler binary) that doesn't reliably run in serverless hosting like Vercel — installing native/system dependencies isn't supported there. Rather than bolt on a fragile workaround, this MVP handles it honestly: if you upload a scanned PDF, the app tells you so and suggests exporting the pages as images and uploading those instead, which *does* go through full OCR.

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
  extract-pdf.ts               PDF text extraction
  ocr.ts                       image OCR
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
- Scanned PDF → explained, with a workaround suggested
- OCR failure on an image
- Extracted text too short to summarize meaningfully
- Summarization API failure (bad key, rate limit, network) → surfaced as a clean error, not a crash

## Known limitations

- **Scanned PDFs aren't OCR'd** — only PDFs with an embedded text layer. See "PDF extraction" above for why, and the suggested workaround (export as image, upload that).
- **Upload size is capped low by default (4MB)** to stay under Vercel's Hobby-tier request body limit (~4.5MB). If you deploy elsewhere or upgrade to Vercel Pro, raise `MAX_FILE_SIZE_MB`.
- **No persistence** — summaries aren't saved. Refreshing the page clears the result. This is intentional for an assessment-scope MVP; adding storage would mean adding a database, which the brief doesn't call for.
- **Single OCR language (English)** — Tesseract.js is loaded with the `eng` model only. Other languages would need additional traineddata bundled in.
- **No automated test suite** — testing was done manually against the scenarios listed in the original brief (see write-up); given the 8-hour scope, that was prioritized over building test infrastructure.
