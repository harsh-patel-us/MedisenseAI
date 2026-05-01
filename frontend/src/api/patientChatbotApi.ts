import axios from 'axios';
import type {
  ChatAttachmentUpload,
  EndSessionResponse,
  PatientChatHistoryResponse,
  PatientChatSendResponse,
  PatientChatSessionDetail,
} from '../types/patientChatbot.types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export async function sendPatientChatMessage(
  patientId: string,
  sessionId: string | null,
  message: string | null,
  attachments: ChatAttachmentUpload[] = [],
  signal?: AbortSignal,
): Promise<PatientChatSendResponse> {
  const { data } = await axios.post<PatientChatSendResponse>(
    `${API_BASE}/patient/chat/message`,
    {
      patient_id: patientId,
      session_id: sessionId,
      message,
      attachments,
    },
    { timeout: 120000, signal },
  );
  return data;
}

export async function getPatientChatHistory(
  patientId: string,
): Promise<PatientChatHistoryResponse> {
  const { data } = await axios.get<PatientChatHistoryResponse>(
    `${API_BASE}/patient/chat/history/${encodeURIComponent(patientId)}`,
  );
  return data;
}

export async function getPatientChatSession(
  sessionId: string,
): Promise<PatientChatSessionDetail> {
  const { data } = await axios.get<PatientChatSessionDetail>(
    `${API_BASE}/patient/chat/session/${encodeURIComponent(sessionId)}`,
  );
  return data;
}

export async function endPatientChatSession(
  patientId: string,
  sessionId: string,
): Promise<EndSessionResponse> {
  const { data } = await axios.post<EndSessionResponse>(
    `${API_BASE}/patient/chat/session/end`,
    { patient_id: patientId, session_id: sessionId },
  );
  return data;
}

/**
 * Best-effort end-session call usable from `beforeunload` / route-change cleanup.
 * Uses keepalive fetch when an auth token is present so the request survives
 * page teardown without losing the Authorization header.
 */
export function endPatientChatSessionBeacon(
  patientId: string,
  sessionId: string,
  token: string | null,
): boolean {
  if (typeof navigator === 'undefined') return false;
  try {
    const url = `${API_BASE}/patient/chat/session/end`;
    const body = JSON.stringify({ patient_id: patientId, session_id: sessionId });
    if (token) {
      void fetch(url, {
        method: 'POST',
        body,
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      return true;
    }
    if (navigator.sendBeacon) {
      return navigator.sendBeacon(
        url,
        new Blob([body], { type: 'application/json' }),
      );
    }
    return false;
  } catch {
    return false;
  }
}

/** Read a File and return its raw base64 (no data: URI prefix). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unexpected FileReader result'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.onerror = () => reject(reader.error || new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

/* ── Voice / TTS ──────────────────────────────────────────────────── */

export interface VoiceMessageResponse {
  transcript: string;
  language: string | null;
  provider: string; // "sarvam" | "gemini" | "none"
}

export interface TTSResponse {
  audio_base64: string;
  mime_type: string;
  provider: string; // "sarvam" | "none"
  language: string | null;
  speaker: string | null;
}

/** Transcribe a recorded audio blob via Sarvam (or Gemini Flash fallback). */
export async function transcribeVoiceMessage(
  patientId: string,
  audioBase64: string,
  mimeType: string = 'audio/webm',
): Promise<VoiceMessageResponse> {
  const { data } = await axios.post<VoiceMessageResponse>(
    `${API_BASE}/patient/chat/voice-message`,
    {
      patient_id: patientId,
      audio_base64: audioBase64,
      mime_type: mimeType,
    },
    { timeout: 60000 },
  );
  return data;
}

/** Synthesize text via Sarvam TTS (returns base64 WAV audio). */
export async function synthesizeTTS(
  text: string,
  languageCode?: string | null,
  speaker?: string | null,
): Promise<TTSResponse> {
  const { data } = await axios.post<TTSResponse>(
    `${API_BASE}/patient/chat/tts`,
    {
      text,
      language_code: languageCode || undefined,
      speaker: speaker || undefined,
    },
    { timeout: 30000 },
  );
  return data;
}

