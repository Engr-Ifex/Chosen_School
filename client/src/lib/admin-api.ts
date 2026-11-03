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
  revisions: Array<{ at: string; changedFields: string[] }>;
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
