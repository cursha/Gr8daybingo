import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import {
  AuthUser,
  LoginInput,
  RegisterInput,
  AnonymousInput,
  authApi,
} from '../lib/auth';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  login: (input: LoginInput) => Promise<{ first_name?: string | null }>;
  register: (input: RegisterInput) => Promise<void>;
  loginAnonymous: (input: AnonymousInput) => Promise<void>;
  registerAnonymous: (input: AnonymousInput) => Promise<void>;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkAuthStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const userData = await authApi.getCurrentUser();
      setUser(userData);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      // Only clear the user on a confirmed auth rejection (401).
      // Network errors, cold-start 500s, etc. should not log the player out —
      // the token is still valid, the request just failed transiently.
      if (status === 401) {
        setUser(null);
      }
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    setError(null);
    const data = await authApi.login(input);
    await checkAuthStatus();
    return { first_name: data.first_name ?? null };
  }, [checkAuthStatus]);

  const register = useCallback(async (input: RegisterInput) => {
    setError(null);
    await authApi.register(input);
    await checkAuthStatus();
  }, [checkAuthStatus]);

  const loginAnonymous = useCallback(async (input: AnonymousInput) => {
    setError(null);
    await authApi.loginAnonymous(input);
    await checkAuthStatus();
  }, [checkAuthStatus]);

  const registerAnonymous = useCallback(async (input: AnonymousInput) => {
    setError(null);
    await authApi.registerAnonymous(input);
    await checkAuthStatus();
  }, [checkAuthStatus]);

  const logout = useCallback(async () => {
    setError(null);
    await authApi.logout();
    setUser(null);
  }, []);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  // Keep an open tab's session sliding forward: periodically re-check (which
  // also re-issues a fresh token server-side) so a player active over a long
  // session is never hard-logged-out just because the original token expired
  // while they were still using the app.
  const isLoggedIn = !!user;
  useEffect(() => {
    if (!isLoggedIn) return;

    const REFRESH_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes
    const interval = setInterval(checkAuthStatus, REFRESH_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkAuthStatus();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isLoggedIn, checkAuthStatus]);

  const value: AuthContextType = {
    user,
    loading,
    error,
    login,
    register,
    loginAnonymous,
    registerAnonymous,
    logout,
    refetch: checkAuthStatus,
    isAdmin: user?.role === 'admin',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};