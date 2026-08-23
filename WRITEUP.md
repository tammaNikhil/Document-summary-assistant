# Approach Write-up

Document Summary Assistant solves the problem of quickly digesting long PDFs and scanned images by generating AI summaries with extractable key points.

Built as a single Next.js 14 app (TypeScript, Tailwind) with no separate backend or database — the frontend and one API route (`/api/summarize`) live in a single deployable project.

PDF text is extracted with `pdf-parse`, reading each document's embedded text layer. Image uploads (JPG/PNG/WEBP) go through Tesseract.js, an open-source OCR engine, free and running server-side. Scanned PDFs are detected (low text density per page) and flagged as unsupported rather than silently producing a poor result, with a suggested workaround.

Extracted text is sent to Groq's hosted Llama 3.3 70B model with a length-aware prompt (short/medium/long), returning a summary and 3-6 key points as JSON. The summarization provider is abstracted behind a small interface, so swapping to OpenAI or Anthropic later needs no rewrite — just a new implementation class.

The UI supports drag-and-drop, a file picker, loading states, and a mobile-responsive layout. Every failure mode — wrong file type, oversized upload, corrupted or scanned PDF, OCR failure, API errors — returns a specific, actionable message.

Deployed on Vercel, connected to GitHub, with environment variables managing API keys.
