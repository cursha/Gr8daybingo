/**
 * Lightweight authenticated fetch wrapper.
 *
 * Stores the JWT returned by the backend auth endpoints in `localStorage`
 * under `auth_token` and attaches it as `Authorization: Bearer <token>` on
 * every request. Components should use `apiClient` for any API call that
 * needs authentication.
 */
import { getAPIBaseURL } from './config';

const TOKEN_KEY = 'auth_token';

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** If true, do NOT attach the auth header. Defaults to false. */
  skipAuth?: boolean;
}

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, skipAuth, headers, ...rest } = options;
  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    ...(headers as Record<string, string> | undefined),
  };

  if (!skipAuth) {
    const token = getAuthToken();
    if (token) finalHeaders['Authorization'] = `Bearer ${token}`;
  }

  const url = path.startsWith('http') ? path : `${getAPIBaseURL()}${path}`;

  const response = await fetch(url, {
    ...rest,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await response.json().catch(() => null) : await response.text();

  if (!response.ok) {
    const detail =
      (data && typeof data === 'object' && 'detail' in data && (data as { detail?: string }).detail) ||
      (typeof data === 'string' ? data : '') ||
      `Request failed (${response.status})`;
    throw new ApiError(detail as string, response.status, data);
  }

  return data as T;
}

/** Like `request`, but sends a FormData body instead of JSON — used for file
 * uploads. The browser sets its own multipart Content-Type (with boundary),
 * so that header must NOT be forced to application/json like `request` does. */
async function requestForm<T>(path: string, formData: FormData): Promise<T> {
  const finalHeaders: Record<string, string> = {
    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
  };
  const token = getAuthToken();
  if (token) finalHeaders['Authorization'] = `Bearer ${token}`;

  const url = path.startsWith('http') ? path : `${getAPIBaseURL()}${path}`;
  const response = await fetch(url, { method: 'POST', headers: finalHeaders, body: formData });

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await response.json().catch(() => null) : await response.text();

  if (!response.ok) {
    const detail =
      (data && typeof data === 'object' && 'detail' in data && (data as { detail?: string }).detail) ||
      (typeof data === 'string' ? data : '') ||
      `Request failed (${response.status})`;
    throw new ApiError(detail as string, response.status, data);
  }

  return data as T;
}

export const apiClient = {
  get: <T>(path: string, options?: ApiRequestOptions) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: ApiRequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
  postForm: <T>(path: string, formData: FormData) => requestForm<T>(path, formData),
};