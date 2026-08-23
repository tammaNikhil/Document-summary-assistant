import { ACCEPTED_MIME_TYPES, MAX_FILE_SIZE_MB } from "./types";

/**
 * Validates a file before it's ever sent to the server. This exists
 * because the server-side check in the API route isn't the only limit
 * in play: hosting platforms (Vercel included) reject oversized request
 * bodies at the infrastructure level, before the route handler even
 * runs. A file that's too big to be worth sending should never leave
 * the browser in the first place — catching it here means the person
 * gets an immediate, specific message instead of a raw HTTP status
 * from a layer they've never heard of.
 */
export function validateFile(file: File): string | null {
  if (!ACCEPTED_MIME_TYPES.includes(file.type as (typeof ACCEPTED_MIME_TYPES)[number])) {
    return "Unsupported file type. Please upload a PDF, JPG, PNG, or WEBP file.";
  }

  const sizeMb = file.size / (1024 * 1024);
  if (sizeMb > MAX_FILE_SIZE_MB) {
    return `That file is ${sizeMb.toFixed(2)}MB — the limit is ${MAX_FILE_SIZE_MB}MB. Please choose a smaller file.`;
  }

  return null;
}
