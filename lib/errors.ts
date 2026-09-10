/**
 * Extract a human-readable message from any thrown or returned error shape:
 * Error instances, Supabase PostgrestError objects ({ message, code, details,
 * hint } — plain objects, NOT Error instances), nested { error: ... } API
 * payloads, or raw strings. NEVER returns "[object Object]".
 */
export function getErrorMessage(error: unknown): string {
  if (error === null || error === undefined) return "Unknown error";

  if (typeof error === "string") return error;
  if (typeof error === "number" || typeof error === "boolean") return String(error);

  if (error instanceof Error) return error.message;

  if (typeof error === "object") {
    const shape = error as Record<string, unknown>;

    // Supabase PostgrestError / standard { message } shapes.
    if (typeof shape.message === "string" && shape.message.trim()) {
      return shape.message;
    }

    // Nested { error: ... } API response payloads.
    if (shape.error !== undefined && shape.error !== null) {
      const nested = getErrorMessage(shape.error);
      if (nested && nested !== "Unknown error") return nested;
    }

    // Last resort: structured JSON instead of "[object Object]".
    try {
      const json = JSON.stringify(shape);
      if (json && json !== "{}") return json;
    } catch {
      /* circular structure — fall through */
    }
  }

  return "Unknown error";
}
