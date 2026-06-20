/**
 * Custom email/password authentication client.
 *
 * Replaces the previous OIDC redirect flow. The backend issues a JWT on
 * register/login; we store it in `localStorage` and attach it as a Bearer
 * token on every API request via `apiClient`.
 */
import { apiClient, clearAuthToken, getAuthToken, setAuthToken } from './apiClient';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role: string;
  last_login?: string;
}

export interface AuthTokenResponse {
  token: string;
  token_type: string;
  user_id: string;
  email: string;
  username?: string | null;
  role: string;
  first_name?: string | null;
}

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

class AuthApi {
  async getCurrentUser(): Promise<AuthUser | null> {
    if (!getAuthToken()) return null;

    // A logged-in player must never be kicked out by a one-off blip. The
    // Supabase edge gateway can briefly reject a valid token (cold start /
    // verify_jwt race) and the network can drop a request. So we only treat
    // the token as dead when a 401 PERSISTS across a couple of quick retries.
    // Any non-401 failure is transient by nature and never clears the token,
    // so the session survives until the backend recovers.
    const MAX_ATTEMPTS = 3;
    let lastErr: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await apiClient.get<AuthUser>('/auth-custom/me');
      } catch (err: unknown) {
        lastErr = err;
        const status = (err as { status?: number })?.status;

        if (attempt < MAX_ATTEMPTS) {
          // Back off briefly, then retry. A genuinely expired/invalid token
          // keeps returning 401; a transient hiccup clears up on the next try.
          await new Promise((r) => setTimeout(r, 400 * attempt));
          continue;
        }

        // Retries exhausted.
        if (status === 401) {
          // The server consistently rejects this token, so it really is invalid.
          clearAuthToken();
          return null;
        }
        // Persistent non-auth failure: surface it, but keep the token so the
        // player stays logged in once the backend is reachable again.
        throw err instanceof Error ? err : new Error('Failed to fetch user');
      }
    }

    // Unreachable (the loop always returns or throws), but keeps TS happy.
    throw lastErr instanceof Error ? lastErr : new Error('Failed to fetch user');
  }

  async register(input: RegisterInput): Promise<AuthTokenResponse> {
    const data = await apiClient.post<AuthTokenResponse>(
      '/auth-custom/register',
      input,
      { skipAuth: true }
    );
    setAuthToken(data.token);
    return data;
  }

  async login(input: LoginInput): Promise<AuthTokenResponse> {
    const data = await apiClient.post<AuthTokenResponse>(
      '/auth-custom/login',
      input,
      { skipAuth: true }
    );
    setAuthToken(data.token);
    return data;
  }

  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth-custom/logout');
    } catch {
      // logout is stateless server-side; ignore errors
    } finally {
      clearAuthToken();
    }
  }
}

export const authApi = new AuthApi();