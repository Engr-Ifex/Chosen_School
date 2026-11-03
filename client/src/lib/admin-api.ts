/**
 * Admin API client.
 *
 * Every call is same-origin through the Vite proxy / Vercel rewrite, so cookies
 * travel automatically — `credentials` is left at the default `same-origin`
 * rather than being loosened to `include`, which would be a step toward the
 * credentialed CORS the architecture deliberately avoids (ADR-015).
 *
 * Mutations need `X-CSRF-Token`; reads do not.
 */

export interface AdminSession {
  admin: { email: string };
  csrfToken: string;
  expiresAt: string;
  idleExpiresAt: string;
}

export interface ApplicationListItem {
  id: string;
  student: {
    surname: string;
    firstName: string;
    middleName: string | null;
    dateOfBirth: string | null;
  };
  placement: { section: string; classApplyingFor: string; academicSession: string };
  guardian: { phone: string };
  submittedAt: string | null;
  hasPhoto: boolean;
}

export interface ListMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApplicationDetail {
  id: string;
  student: Record<string, string | null>;
  guardian: Record<string, string | null>;
  placement: Record<string, string>;
  signature: { typedName: string; signedAt: string };
  healthInformation: string | null;
  photo: { contentType: string; width: number; height: number } | null;
  revisions: Array<{
    at: string;
    changedFields: string[];
    before?: Record<string, string | null>;
    after?: Record<string, string | null>;
  }>;
  submittedAt: string;
  deletedAt: string | null;
}

export interface ListParams {
  q?: string;
  section?: string;
  class?: string;
  session?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; fields?: Record<string, string> };

const BASE = '/api/v1';

async function readError(response: Response): Promise<{ message: string; fields?: Record<string, string> }> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string; fields?: Record<string, string> };
    };
    return {
      message: body.error?.message ?? 'Something went wrong. Please try again.',
      fields: body.error?.fields,
    };
  } catch {
    return { message: 'Something went wrong. Please try again.' };
  }
}

export async function fetchSession(): Promise<AdminSession | null> {
  try {
    const response = await fetch(`${BASE}/auth/session`);
    if (!response.ok) return null;
    return (await response.json()) as AdminSession;
  } catch {
    return null;
  }
}

export async function signIn(
  email: string,
  password: string,
): Promise<ApiResult<AdminSession>> {
  let response: Response;
  try {
    response = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return { ok: false, status: 0, message: 'Could not reach the server. Check your connection.' };
  }

  if (response.ok) {
    return { ok: true, data: (await response.json()) as AdminSession };
  }

  const error = await readError(response);
  return { ok: false, status: response.status, message: error.message, fields: error.fields };
}

export async function signOut(csrfToken: string): Promise<void> {
  try {
    await fetch(`${BASE}/auth/logout`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrfToken },
    });
  } catch {
    // A failed logout still means the UI should return to the sign-in screen;
    // the session expires on its own.
  }
}

export async function fetchApplications(params: ListParams): Promise<ApiResult<{ data: ApplicationListItem[]; meta: ListMeta }>> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }

  let response: Response;
  try {
    response = await fetch(`${BASE}/admin/applications?${query.toString()}`);
  } catch {
    return { ok: false, status: 0, message: 'Could not reach the server.' };
  }

  if (!response.ok) {
    const error = await readError(response);
    return { ok: false, status: response.status, message: error.message, fields: error.fields };
  }

  return { ok: true, data: (await response.json()) as { data: ApplicationListItem[]; meta: ListMeta } };
}

export async function fetchApplication(id: string): Promise<ApiResult<ApplicationDetail>> {
  let response: Response;
  try {
    response = await fetch(`${BASE}/admin/applications/${encodeURIComponent(id)}`);
  } catch {
    return { ok: false, status: 0, message: 'Could not reach the server.' };
  }

  if (!response.ok) {
    const error = await readError(response);
    return { ok: false, status: response.status, message: error.message };
  }

  return { ok: true, data: (await response.json()) as ApplicationDetail };
}

export interface TrashItem {
  id: string;
  student: { surname: string; firstName: string; middleName: string | null };
  placement: { section: string; classApplyingFor: string };
  submittedAt: string | null;
  deletedAt: string | null;
}

/**
 * Every mutation carries the CSRF token from the session. The server rejects a
 * mutation without one, so passing it is not optional bookkeeping.
 */
async function mutate(
  path: string,
  method: 'POST' | 'DELETE',
  csrfToken: string,
  body?: unknown,
): Promise<ApiResult<null>> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'X-CSRF-Token': csrfToken,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, message: 'Could not reach the server.' };
  }

  if (!response.ok) {
    const error = await readError(response);
    return { ok: false, status: response.status, message: error.message };
  }

  return { ok: true, data: null };
}

export function trashApplication(id: string, csrfToken: string): Promise<ApiResult<null>> {
  return mutate(`/admin/applications/${encodeURIComponent(id)}`, 'DELETE', csrfToken);
}

export function restoreApplication(id: string, csrfToken: string): Promise<ApiResult<null>> {
  return mutate(`/admin/applications/${encodeURIComponent(id)}/restore`, 'POST', csrfToken);
}

/**
 * Irreversible. `confirm` must equal the id — the server rejects anything else,
 * so a stray or replayed request cannot destroy the wrong record.
 */
export function deletePermanently(
  id: string,
  csrfToken: string,
): Promise<ApiResult<null>> {
  return mutate(
    `/admin/applications/${encodeURIComponent(id)}/permanent`,
    'DELETE',
    csrfToken,
    { confirm: id },
  );
}

export async function fetchTrash(page = 1): Promise<ApiResult<{ data: TrashItem[]; meta: ListMeta }>> {
  let response: Response;
  try {
    response = await fetch(`${BASE}/admin/trash?type=application&page=${page}`);
  } catch {
    return { ok: false, status: 0, message: 'Could not reach the server.' };
  }

  if (!response.ok) {
    const error = await readError(response);
    return { ok: false, status: response.status, message: error.message };
  }

  return { ok: true, data: (await response.json()) as { data: TrashItem[]; meta: ListMeta } };
}

/**
 * Saves an edit. The body carries only the fields that changed — the server
 * rejects immutable ones outright and writes a revision for whatever moved.
 */
export async function updateApplication(
  id: string,
  csrfToken: string,
  changes: Record<string, unknown>,
): Promise<ApiResult<ApplicationDetail>> {
  let response: Response;
  try {
    response = await fetch(`${BASE}/admin/applications/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify(changes),
    });
  } catch {
    return { ok: false, status: 0, message: 'Could not reach the server.' };
  }

  if (!response.ok) {
    const error = await readError(response);
    return { ok: false, status: response.status, message: error.message, fields: error.fields };
  }

  return { ok: true, data: (await response.json()) as ApplicationDetail };
}

/**
 * Downloads a PDF.
 *
 * Fetched rather than linked so an expired session surfaces as a message rather
 * than a browser tab full of JSON. The blob URL is revoked once the click has
 * been dispatched.
 */
export async function downloadPdf(path: string): Promise<ApiResult<null>> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`);
  } catch {
    return { ok: false, status: 0, message: 'Could not reach the server.' };
  }

  if (!response.ok) {
    const error = await readError(response);
    return { ok: false, status: response.status, message: error.message };
  }

  const disposition = response.headers.get('content-disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] ?? 'application.pdf';

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Give the browser a moment to start the download before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);

  return { ok: true, data: null };
}

export function singlePdfPath(id: string): string {
  return `/admin/applications/${encodeURIComponent(id)}/pdf`;
}

export function bulkPdfPath(ids: string[]): string {
  return `/admin/applications/pdf?ids=${ids.map(encodeURIComponent).join(',')}`;
}
