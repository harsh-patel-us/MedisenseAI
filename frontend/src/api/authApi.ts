import axios from 'axios';
import type {
  AuthResponse,
  AuthUser,
  LoginRequest,
  RegisterRequest,
} from '../types/auth.types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'medisense_token';
const USER_KEY = 'medisense_user';

// ── Token storage ────────────────────────────────────────────────────────
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setStoredUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

// ── Axios auth interceptor ───────────────────────────────────────────────
// Attach bearer token to every outgoing request.
axios.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers || {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

// Log out on 401 so a stale/expired token doesn't break the UI silently.
axios.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error?.response?.status === 401) {
      clearToken();
    }
    return Promise.reject(error);
  },
);

// ── API calls ────────────────────────────────────────────────────────────
export async function login(body: LoginRequest): Promise<AuthResponse> {
  const { data } = await axios.post<AuthResponse>(`${API_BASE}/auth/login`, body);
  return data;
}

export async function register(body: RegisterRequest): Promise<AuthResponse> {
  const { data } = await axios.post<AuthResponse>(`${API_BASE}/auth/register`, body);
  return data;
}

export async function fetchMe(): Promise<AuthUser> {
  const { data } = await axios.get<AuthUser>(`${API_BASE}/auth/me`);
  return data;
}
