import axios from 'axios';
import type {
  GoogleAuthUrlResponse,
  GoogleConnectionStatus,
} from '../types/consultation.types';

const API = '';

export async function fetchGoogleStatus(): Promise<GoogleConnectionStatus> {
  const { data } = await axios.get<GoogleConnectionStatus>(
    `${API}/integrations/google/status`,
  );
  return data;
}

export async function fetchGoogleAuthUrl(): Promise<GoogleAuthUrlResponse> {
  const { data } = await axios.get<GoogleAuthUrlResponse>(
    `${API}/integrations/google/auth-url`,
  );
  return data;
}

export async function disconnectGoogle(): Promise<GoogleConnectionStatus> {
  const { data } = await axios.post<GoogleConnectionStatus>(
    `${API}/integrations/google/disconnect`,
  );
  return data;
}
