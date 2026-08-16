import {
  type CreateCustomerInput,
  type CreateInvoiceResponse,
  type Customer,
  type EinvoiceResponse,
  type Invoice,
  type InvoiceDetail,
  type IssueResponse,
  type LoginResponse,
  type RegisterResponse,
  type UpdateCustomerInput,
} from './api-types';

/**
 * Typed fetch wrapper for the NestJS API.
 *
 * Auth storage: the JWT currently lives in `localStorage` (key
 * `vittixbiz_access_token`). This is NOT production-appropriate: any XSS can
 * read it and exfiltrate the token. Before real deployment this must move to
 * an httpOnly cookie set by a Server Action (Next.js App Router) so the token
 * is never reachable from client JavaScript. Deferred here to keep the first
 * frontend slice small — see the README "Known gaps" section.
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

const TOKEN_KEY = 'vittixbiz_access_token';

/** Reads the auth token. Returns null on the server (SSR/prerender) or when absent. */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

/**
 * Error thrown for any non-2xx API response. `status` lets callers branch on
 * concrete codes (422 = e-invoice validation failure, 401 = expired token,
 * 409 = duplicate email, 403 = not a member of the org).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(status: number, message: string, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

function extractMessage(payload: unknown): string | null {
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    if (Array.isArray(obj.message)) return obj.message.join('. ');
  }
  return null;
}

/** Recursively finds the first error message in a ZodError-like payload. */
function extractZodError(payload: unknown): string | null {
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    const errors = obj.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      const first = errors[0] as Record<string, unknown>;
      if (typeof first.message === 'string') return first.message;
    }
  }
  return null;
}

async function parseError(response: Response): Promise<string> {
  const fallback = `Request failed with status ${response.status}`;
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return fallback;
  }
  return (
    extractMessage(payload) ?? extractZodError(payload) ?? fallback
  );
}

/**
 * Performs an authenticated JSON request.
 * - Attaches `Authorization: Bearer <token>` when a token is present.
 * - Parses the JSON body on 2xx.
 * - Throws `ApiError` (status + message) on anything else so callers can
 *   branch on status codes instead of guessing from a generic message.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (options.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new ApiError(
      response.status,
      await parseError(response),
      undefined
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/** JSON body helper for POST/PATCH/PUT calls. */
export function jsonBody(body: unknown): RequestInit {
  return { body: JSON.stringify(body) };
}

/**
 * Fetches the invoice PDF and opens it in a new tab. Uses a raw fetch (not
 * `apiFetch`) because the endpoint returns binary data, not JSON.
 */
export async function openInvoicePdf(orgId: string, invoiceId: string) {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(
    `${BASE_URL}/organizations/${orgId}/invoices/${invoiceId}/pdf`,
    { headers }
  );
  if (!response.ok) {
    throw new ApiError(response.status, await parseError(response));
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (win) {
    win.focus();
  }
}

// ---------------------------------------------------------------------------
// Endpoints (routes verified against apps/api/src):
// ---------------------------------------------------------------------------

export const authApi = {
  register: (input: {
    email: string;
    password: string;
    fullName: string;
  }) => apiFetch<RegisterResponse>('/auth/register', jsonBody(input)),

  login: (input: { email: string; password: string }) =>
    apiFetch<LoginResponse>('/auth/login', jsonBody(input)),
};

export const customersApi = {
  list: (orgId: string) =>
    apiFetch<Customer[]>(`/organizations/${orgId}/customers`),

  get: (orgId: string, id: string) =>
    apiFetch<Customer>(`/organizations/${orgId}/customers/${id}`),

  create: (orgId: string, input: CreateCustomerInput) =>
    apiFetch<Customer>(
      `/organizations/${orgId}/customers`,
      jsonBody(input)
    ),

  update: (orgId: string, id: string, input: UpdateCustomerInput) =>
    apiFetch<Customer>(
      `/organizations/${orgId}/customers/${id}`,
      {
        method: 'PATCH',
        ...jsonBody(input),
      }
    ),
};

export const invoicesApi = {
  list: (orgId: string, status?: string) =>
    apiFetch<Invoice[]>(
      `/organizations/${orgId}/invoices${
        status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : ''
      }`
    ),

  get: (orgId: string, id: string) =>
    apiFetch<InvoiceDetail>(`/organizations/${orgId}/invoices/${id}`),

  create: (
    orgId: string,
    input: {
      gstinId: string;
      customerId: string;
      invoiceDate: string;
      dueDate?: string;
      notes?: string;
      lineItems: {
        hsnSacCode: string;
        description: string;
        quantity: string;
        unitPrice: string;
        discountAmount?: string;
        unit?: string;
      }[];
    }
  ) =>
    apiFetch<CreateInvoiceResponse>(
      `/organizations/${orgId}/invoices`,
      jsonBody(input)
    ),

  issue: (orgId: string, id: string) =>
    apiFetch<IssueResponse>(`/organizations/${orgId}/invoices/${id}/issue`, {
      method: 'POST',
    }),

  einvoice: (orgId: string, id: string) =>
    apiFetch<EinvoiceResponse>(
      `/organizations/${orgId}/invoices/${id}/einvoice`,
      { method: 'POST' }
    ),
};