export type GoogleInviteStatus = 'sent' | 'skipped' | 'failed';

export interface GoogleConnectionStatus {
  connected: boolean;
  email: string | null;
}

export interface GoogleAuthUrlResponse {
  auth_url: string;
  state: string;
}
