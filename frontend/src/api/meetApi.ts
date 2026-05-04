import axios from 'axios';
import type { GoogleInviteStatus } from '../types/consultation.types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

/* ── Types ──────────────────────────────────────────────────────────── */

export interface ScheduleMeetingRequest {
  doctor_name: string;
  patient_name: string;
  patient_email?: string;
  doctor_email?: string;
  scheduled_at: string;
  duration_minutes: number;
  reason: string;
}

export interface ScheduledMeeting {
  session_id: string;
  doctor_name: string;
  patient_name: string;
  patient_email?: string | null;
  doctor_email?: string | null;
  scheduled_at: string;
  duration_minutes: number;
  reason: string;
  status: string;
  created_at: string;
  organizer_role?: 'doctor' | 'patient' | null;
  meet_link?: string | null;
  google_event_id?: string | null;
  google_event_link?: string | null;
  google_invite_status?: GoogleInviteStatus;
  google_invite_error?: string | null;
}

export interface LinkConferenceRequest {
  session_id: string;
  meet_conference_id: string;
  patient_name?: string | null;
  doctor_name?: string | null;
}

export interface LinkConferenceResponse {
  session_id: string;
  meet_conference_id: string;
  status: string;
}

export interface ProcessTranscriptRequest {
  session_id: string;
  meet_conference_id?: string | null;
}

export interface ProcessTranscriptResponse {
  task_id: string;
  session_id: string;
  status: string;
}

export interface ProcessStatusResponse {
  task_id: string;
  session_id: string;
  status: string;        // "pending" | "running" | "completed" | "failed"
  detail: string;
  started_at: string;
  completed_at: string | null;
  soap_note: Record<string, unknown> | null;
  patient_explanation: Record<string, unknown> | null;
  transcript: Array<{
    speaker: string;
    text: string;
    timestamp: string;
    confidence: number;
  }>;
}

export interface UnprocessedSession {
  session_id: string;
  doctor_name: string | null;
  patient_name: string | null;
  meet_conference_id: string | null;
  processing_status: string | null;
  created_at: string;
}

/* ── API calls ─────────────────────────────────────────────────────── */

export async function scheduleMeeting(
  payload: ScheduleMeetingRequest,
): Promise<ScheduledMeeting> {
  const { data } = await axios.post<ScheduledMeeting>(
    `${API_BASE}/meet/schedule`,
    payload,
  );
  return data;
}

export async function listScheduledMeetings(): Promise<ScheduledMeeting[]> {
  const { data } = await axios.get<{ meetings: ScheduledMeeting[] }>(
    `${API_BASE}/meet/scheduled`,
  );
  return data.meetings || [];
}

export async function linkConference(
  payload: LinkConferenceRequest,
): Promise<LinkConferenceResponse> {
  const { data } = await axios.post<LinkConferenceResponse>(
    `${API_BASE}/meet/link-conference`,
    payload,
  );
  return data;
}

export async function processTranscript(
  payload: ProcessTranscriptRequest,
): Promise<ProcessTranscriptResponse> {
  const { data } = await axios.post<ProcessTranscriptResponse>(
    `${API_BASE}/meet/process-transcript`,
    payload,
  );
  return data;
}

export async function getProcessStatus(
  taskId: string,
): Promise<ProcessStatusResponse> {
  const { data } = await axios.get<ProcessStatusResponse>(
    `${API_BASE}/meet/process-status/${encodeURIComponent(taskId)}`,
  );
  return data;
}

export async function listUnprocessedSessions(): Promise<UnprocessedSession[]> {
  const { data } = await axios.get<UnprocessedSession[]>(
    `${API_BASE}/meet/sessions/unprocessed`,
  );
  return data;
}
