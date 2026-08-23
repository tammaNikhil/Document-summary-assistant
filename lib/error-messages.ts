/**
 * Translates an HTTP status into a human message for the cases where
 * the response body isn't our own JSON error shape — meaning the
 * request was rejected by the hosting platform/proxy before it ever
 * reached the API route (payload too large, gateway timeout, the
 * function briefly cold or overloaded, etc). Our own route always
 * returns proper JSON, so this is only reached for infra-level failures.
 */
export function friendlyUploadErrorMessage(status: number, maxFileSizeMb: number): string {
  if (status === 413) {
    return `That file is too large for the server to accept. Please choose a file under ${maxFileSizeMb}MB.`;
  }
  if (status === 502 || status === 503 || status === 504) {
    return "The server is temporarily unavailable. Please try again in a moment.";
  }
  if (status >= 500) {
    return "Something went wrong on the server. Please try again.";
  }
  return `The server returned an unexpected error (status ${status}). Please try again.`;
}
