/**
 * `next/server` for the offline edition.
 *
 * The API route handlers are reused verbatim — they are plain functions from `Request` to
 * `Response` — and this is the only Next-specific thing they import.
 */

export const NextResponse = {
  json(data: unknown, init?: { status?: number }): Response {
    return new Response(JSON.stringify(data), {
      status: init?.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  },
};
