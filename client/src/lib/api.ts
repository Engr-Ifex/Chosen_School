/**
 * The browser's only route to the API.
 *
 * Everything goes through `/api/v1`, which Vite proxies in development and
 * Vercel rewrites in production — so the browser sees one origin and no CORS
 * or cookie configuration is needed (docs/ARCHITECTURE.md §5).
 *
 * The result type is a discriminated union rather than exceptions, because the
 * caller must handle three genuinely different outcomes and one of them is
 * dangerous to get wrong:
 *
 *   - `validation` — the server rejected specific fields. Show them, keep input.
 *   - `failure`    — something went wrong. Show it, keep input, allow retry.
 *   - `unknown`    — the request may or may not have been saved.
 *
 * **A timeout is `unknown`, never success.** Treating a slow Render cold start
 * as success would show "submitted successfully" for a record that was never
 * written; treating it as failure invites a duplicate. The UI says so plainly.
 */

export interface FieldErrors {
  [fieldPath: string]: string;
}

export type SubmitResult =
  | { ok: true; id: string; submittedAt: string }
  | { ok: false; kind: 'validation'; message: string; fields: FieldErrors }
  | { ok: false; kind: 'failure'; message: string }
  | { ok: false; kind: 'unknown'; message: string };

export interface PlacementOptions {
  primary: string[];
  secondary: string[];
  sessions: string[];
  currentSession: string | null;
}

const BASE = '/api/v1';

/**
 * Render's free tier can take ~50 s to wake. The timeout is generous on
 * purpose: cutting off at 10 s would turn every cold start into a false
 * failure, which is worse than a slow spinner.
 */
const TIMEOUT_MS = 60_000;

interface ErrorEnvelope {
  error?: { code?: string; message?: string; fields?: FieldErrors };
}

async function request(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    return await fetch(`${BASE}${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}


/** Builds the multipart body the API expects when a photo is attached. */
function buildMultipart(body: unknown, photo: File): FormData {
  const form = new FormData();
  form.append('payload', JSON.stringify(body));
  form.append('photo', photo);
  return form;
}

export async function submitApplication(
  body: unknown,
  photo?: File | null,
): Promise<SubmitResult> {
  let response: Response;

  try {
    // A photo switches the request to multipart: the JSON fields travel as a
    // `payload` part and the file as `photo`. The Content-Type header is
    // deliberately not set — the browser must add its own boundary.
    const init: RequestInit = photo
      ? { method: 'POST', body: buildMultipart(body, photo) }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        };

    response = await request('/public/applications', init);
  } catch {
    // Network failure or abort. We cannot know whether the request arrived.
    return {
      ok: false,
      kind: 'unknown',
      message:
        "We couldn't confirm whether your application was received. Please check your connection and try again.",
    };
  }

  if (response.status === 201) {
    try {
      const data = (await response.json()) as { id: string; submittedAt: string };
      if (typeof data?.id === 'string' && data.id.length > 0) {
        return { ok: true, id: data.id, submittedAt: data.submittedAt };
      }
    } catch {
      // A 201 with an unreadable body still means "created", but we cannot
      // prove it, and the promise is only kept on a real confirmation.
    }
    return {
      ok: false,
      kind: 'unknown',
      message: 'Your application may have been received, but we could not confirm it.',
    };
  }

  let envelope: ErrorEnvelope = {};
  try {
    envelope = (await response.json()) as ErrorEnvelope;
  } catch {
    // Non-JSON error body (a proxy page, for example).
  }

  const message = envelope.error?.message ?? 'Something went wrong. Please try again.';

  if (response.status === 422 && envelope.error?.fields) {
    return { ok: false, kind: 'validation', message, fields: envelope.error.fields };
  }

  return { ok: false, kind: 'failure', message };
}

export async function fetchPlacementOptions(): Promise<PlacementOptions | null> {
  try {
    const response = await request('/public/placement-options', { method: 'GET' });
    if (!response.ok) return null;
    const data = (await response.json()) as PlacementOptions;
    return {
      primary: data.primary ?? [],
      secondary: data.secondary ?? [],
      sessions: data.sessions ?? [],
      currentSession: data.currentSession ?? null,
    };
  } catch {
    return null;
  }
}
