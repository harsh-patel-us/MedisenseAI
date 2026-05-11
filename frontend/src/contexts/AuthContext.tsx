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

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
const ACTIVITY_WRITE_THROTTLE_MS = 30 * 1000;
const LAST_ACTIVITY_KEY = 'medisense_last_activity_at';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (body: LoginRequest) => Promise<AuthUser>;
  register: (body: RegisterRequest) => Promise<AuthUser>;
  logout: () => void;
  setUser: (user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [loading, setLoading] = useState<boolean>(!!getToken());

  const markActivity = useCallback((force = false) => {
    const now = Date.now();
    const last = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || 0);
    if (force || now - last > ACTIVITY_WRITE_THROTTLE_MS) {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
    }
  }, []);

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
        markActivity(true);
      } catch {
        clearToken();
        localStorage.removeItem(LAST_ACTIVITY_KEY);
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
    markActivity(true);
    setUser(res.user);
    return res.user;
  }, [markActivity]);

  const register = useCallback(async (body: RegisterRequest) => {
    const res = await apiRegister(body);
    setToken(res.access_token);
    setStoredUser(res.user);
    markActivity(true);
    setUser(res.user);
    return res.user;
  }, [markActivity]);

  const logout = useCallback(() => {
    clearToken();
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    setUser(null);
  }, []);

  useEffect(() => {
    if (!user) return;

    const existingLastActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || 0);
    if (
      existingLastActivity
      && Date.now() - existingLastActivity >= INACTIVITY_TIMEOUT_MS
    ) {
      logout();
      return;
    }
    markActivity(true);

    const activityEvents: Array<keyof WindowEventMap> = [
      'click',
      'keydown',
      'mousemove',
      'scroll',
      'touchstart',
      'focus',
    ];

    const isExpired = () => {
      const lastActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || 0);
      return !lastActivity || Date.now() - lastActivity >= INACTIVITY_TIMEOUT_MS;
    };

    const handleActivity = () => {
      if (isExpired()) {
        logout();
        return;
      }
      markActivity();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      handleActivity();
    };

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'medisense_token' && event.newValue === null) {
        setUser(null);
      }
    };
    window.addEventListener('storage', handleStorage);

    const timer = window.setInterval(() => {
      if (isExpired()) {
        logout();
      }
    }, 30 * 1000);

    return () => {
      window.clearInterval(timer);
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, [user, logout, markActivity]);

  const updateUser = useCallback((next: AuthUser) => {
    setStoredUser(next);
    setUser(next);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, setUser: updateUser }),
    [user, loading, login, register, logout, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
