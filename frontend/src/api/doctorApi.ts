import axios from 'axios';
import type { GenerateNoteResponse, TranscriptSegment, SoapNote, SessionInfo } from '../types/doctor.types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export async function generateNote(
  transcript: TranscriptSegment[],
  sessionId: string
): Promise<GenerateNoteResponse> {
  const response = await axios.post<GenerateNoteResponse>(`${API_BASE}/doctor/generate-note`, {
    transcript,
    session_id: sessionId,
  });
  return response.data;
}

export async function exportSoapPdf(
  soapNote: SoapNote,
  patientName?: string,
  doctorName?: string,
  sessionId?: string
): Promise<Blob> {
  const response = await axios.post(
    `${API_BASE}/doctor/export-pdf`,
    {
      soap_note: soapNote,
      patient_name: patientName || 'Anonymous Patient',
      doctor_name: doctorName || 'Attending Physician',
      session_id: sessionId,
    },
    { responseType: 'blob' }
  );
  return response.data;
}

export async function getSessions(): Promise<SessionInfo[]> {
  const response = await axios.get<SessionInfo[]>(`${API_BASE}/doctor/sessions`);
  return response.data;
}

export function createAudioWebSocket(): WebSocket {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsHost = import.meta.env.VITE_WS_URL || `${wsProtocol}//${window.location.hostname}:8000`;
  return new WebSocket(`${wsHost}/api/doctor/stream-audio`);
}
