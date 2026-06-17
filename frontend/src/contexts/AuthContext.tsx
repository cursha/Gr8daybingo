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
  authApi,
} from '../lib/auth';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  login: (input: LoginInput) => Promise<{ first_name?: string | null }>;
  register: (input: RegisterInput) => Promise<void>;
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

  const logout = useCallback(async () => {
    setError(null);
    await authApi.logout();
    setUser(null);
  }, []);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const value: AuthContextType = {
    user,
    loading,
    error,
    login,
    register,
    logout,
    refetch: checkAuthStatus,
    isAdmin: user?.role === 'admin',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};