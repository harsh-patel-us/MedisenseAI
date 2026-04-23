import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  clearToken,
  fetchMe,
  getStoredUser,
  getToken,
  login as apiLogin,
  register as apiRegister,
  setStoredUser,
  setToken,
} from '../api/authApi';
import type {
  AuthUser,
  LoginRequest,
  RegisterRequest,
} from '../types/auth.types';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (body: LoginRequest) => Promise<AuthUser>;
  register: (body: RegisterRequest) => Promise<AuthUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [loading, setLoading] = useState<boolean>(!!getToken());

  // On first load, if we have a token, verify it server-side and refresh user.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const fresh = await fetchMe();
        setUser(fresh);
        setStoredUser(fresh);
      } catch {
        clearToken();
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (body: LoginRequest) => {
    const res = await apiLogin(body);
    setToken(res.access_token);
    setStoredUser(res.user);
    setUser(res.user);
    return res.user;
  }, []);

  const register = useCallback(async (body: RegisterRequest) => {
    const res = await apiRegister(body);
    setToken(res.access_token);
    setStoredUser(res.user);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
