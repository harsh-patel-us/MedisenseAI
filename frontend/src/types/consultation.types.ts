export type GoogleInviteStatus = 'sent' | 'skipped' | 'failed';

export interface GoogleConnectionStatus {
  connected: boolean;
  email: string | null;
}

export interface GoogleAuthUrlResponse {
  auth_url: string;
  state: string;
}

/* ── Pre-visit intake form ─────────────────────────────────────────── */

export interface IntakeFormData {
  session_id: string;
  questions: string[];
  patient_name: string | null;
  already_submitted: boolean;
}

export interface IntakeSubmitData {
  patient_name: string;
  answers: Record<string, string>;
}

export interface IntakeSummary {
  session_id: string;
  intake_data: {
    patient_name?: string;
    answers?: Record<string, string>;
  } | null;
  intake_summary: string | null;
  submitted_at: string | null;
}
