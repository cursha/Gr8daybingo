/**
 * Battle test for Bug #11 — "Game loses credentials during play".
 *
 * The fix lives in src/lib/auth.ts `getCurrentUser()`. The old code threw the
 * player's saved token away on the FIRST 401 from /auth-custom/me. A single
 * transient gateway blip (Supabase verify_jwt race / cold start) therefore
 * logged a valid player out permanently.
 *
 * The new code retries before giving up:
 *   - a 401 that does NOT persist  -> session kept (the real bug)
 *   - a 401 that persists          -> token cleared (genuine bad/expired token)
 *   - any non-401 failure          -> token NEVER cleared (backend blip)
 *
 * These tests pin that behaviour so it can never silently regress.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the network/token layer so we drive exactly what the server "returns".
vi.mock('@/lib/apiClient', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  getAuthToken: vi.fn(),
  setAuthToken: vi.fn(),
  clearAuthToken: vi.fn(),
}));

import { authApi } from '@/lib/auth';
import {
  apiClient,
  getAuthToken,
  clearAuthToken,
} from '@/lib/apiClient';

const get = vi.mocked(apiClient.get);
const mockGetToken = vi.mocked(getAuthToken);
const mockClear = vi.mocked(clearAuthToken);

/** An error shaped like the app's ApiError (Error subclass carrying `status`). */
function httpError(status: number): Error & { status: number } {
  const e = new Error(`HTTP ${status}`) as Error & { status: number };
  e.status = status;
  return e;
}

const USER = { id: 'u1', email: 'player@havagr8day.com', role: 'player' };

/**
 * getCurrentUser awaits internal setTimeout backoffs between retries. Fake
 * timers let us flush those instantly and keep the suite fast + deterministic.
 */
async function runWithTimers<T>(promise: Promise<T>): Promise<T> {
  // Guard against a *false* unhandled-rejection warning: while we flush the
  // retry-backoff timers, the promise may settle (reject) before the test
  // attaches its own `.rejects` handler. An immediate no-op catch marks it
  // handled; the original promise is still returned so assertions see the
  // real resolve/reject value.
  promise.catch(() => undefined);
  await vi.runAllTimersAsync();
  return promise;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  // Default: the player IS logged in (token present). Individual tests override.
  mockGetToken.mockReturnValue('valid-token');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('authApi.getCurrentUser — credential stability (Bug #11)', () => {
  it('returns null and makes no request when there is no token', async () => {
    mockGetToken.mockReturnValue(null);

    const result = await authApi.getCurrentUser();

    expect(result).toBeNull();
    expect(get).not.toHaveBeenCalled();
    expect(mockClear).not.toHaveBeenCalled();
  });

  it('returns the user on a clean first response (no retries, no clearing)', async () => {
    get.mockResolvedValueOnce(USER);

    const result = await runWithTimers(authApi.getCurrentUser());

    expect(result).toEqual(USER);
    expect(get).toHaveBeenCalledTimes(1);
    expect(mockClear).not.toHaveBeenCalled();
  });

  // THE core regression guard: one transient 401 must NOT log the player out.
  it('survives a single transient 401 by retrying, and keeps the token', async () => {
    get.mockRejectedValueOnce(httpError(401)).mockResolvedValueOnce(USER);

    const result = await runWithTimers(authApi.getCurrentUser());

    expect(result).toEqual(USER);
    expect(get).toHaveBeenCalledTimes(2);
    expect(mockClear).not.toHaveBeenCalled();
  });

  it('survives two transient 401s and recovers on the third attempt', async () => {
    get
      .mockRejectedValueOnce(httpError(401))
      .mockRejectedValueOnce(httpError(401))
      .mockResolvedValueOnce(USER);

    const result = await runWithTimers(authApi.getCurrentUser());

    expect(result).toEqual(USER);
    expect(get).toHaveBeenCalledTimes(3);
    expect(mockClear).not.toHaveBeenCalled();
  });

  // Genuine bad/expired token: a 401 that persists across all attempts must
  // clear the token and report logged-out — exactly once.
  it('clears the token when a 401 persists across all retries', async () => {
    get.mockRejectedValue(httpError(401));

    const result = await runWithTimers(authApi.getCurrentUser());

    expect(result).toBeNull();
    expect(get).toHaveBeenCalledTimes(3);
    expect(mockClear).toHaveBeenCalledTimes(1);
  });

  // Backend outage / cold start: 5xx must NEVER wipe the session.
  it('never clears the token on a persistent 500 (throws instead)', async () => {
    get.mockRejectedValue(httpError(500));

    await expect(runWithTimers(authApi.getCurrentUser())).rejects.toBeTruthy();
    expect(get).toHaveBeenCalledTimes(3);
    expect(mockClear).not.toHaveBeenCalled();
  });

  it('recovers from a single transient 500 without clearing the token', async () => {
    get.mockRejectedValueOnce(httpError(500)).mockResolvedValueOnce(USER);

    const result = await runWithTimers(authApi.getCurrentUser());

    expect(result).toEqual(USER);
    expect(get).toHaveBeenCalledTimes(2);
    expect(mockClear).not.toHaveBeenCalled();
  });

  // Network drop (no HTTP status at all) must not log the player out either.
  it('never clears the token on a persistent network error', async () => {
    get.mockRejectedValue(new Error('Failed to fetch'));

    await expect(runWithTimers(authApi.getCurrentUser())).rejects.toBeTruthy();
    expect(get).toHaveBeenCalledTimes(3);
    expect(mockClear).not.toHaveBeenCalled();
  });
});
