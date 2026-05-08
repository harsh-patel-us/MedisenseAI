import axios from 'axios';
import type {
  FollowUpPlan,
  GenerateNoteResponse,
  SessionInfo,
  SoapAuditResponse,
  SoapNote,
  TranscriptSegment,
  UploadAudioResponse,
} from '../types/doctor.types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export async function uploadAudioFile(
  file: File,
  onUploadProgress?: (percent: number) => void,
): Promise<UploadAudioResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await axios.post<UploadAudioResponse>(
    `${API_BASE}/doctor/upload-audio`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 180000,
      onUploadProgress: (e) => {
        if (onUploadProgress && e.total) {
          onUploadProgress(Math.round((e.loaded * 100) / e.total));
        }
      },
    },
  );
  return response.data;
}

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

/** Fetch the patient-facing follow-up plan for a session. The backend
 *  returns `status: "pending"` while the background extractor is still
 *  running and the populated payload once it has landed. */
export async function getFollowUpPlan(sessionId: string): Promise<FollowUpPlan> {
  const { data } = await axios.get<FollowUpPlan>(
    `${API_BASE}/doctor/sessions/${encodeURIComponent(sessionId)}/followup`,
  );
  return data;
}

/** Render the follow-up plan as a patient-facing PDF and return its bytes. */
export async function downloadFollowUpPdf(sessionId: string): Promise<Blob> {
  const response = await axios.post(
    `${API_BASE}/doctor/sessions/${encodeURIComponent(sessionId)}/followup/pdf`,
    null,
    { responseType: 'blob' },
  );
  return response.data;
}

/** Append the follow-up summary to the patient's Dr. MediSense chat. */
export async function sendFollowUpToPatient(
  sessionId: string,
): Promise<{ ok: boolean; patient_id: string; is_sent_to_patient: boolean }> {
  const { data } = await axios.post<{
    ok: boolean;
    patient_id: string;
    is_sent_to_patient: boolean;
  }>(
    `${API_BASE}/doctor/sessions/${encodeURIComponent(sessionId)}/followup/send-to-patient`,
  );
  return data;
}


/** Fetch the second-opinion audit for a session.
 *
 *  The backend returns 202 with `{status: "pending"}` while the audit task
 *  is still running and 200 with the full report once it lands. We use
 *  validateStatus to fold the 202 into the same Promise without an axios
 *  rejection, so the caller can simply read `data.status`.
 */
export async function getAuditReport(sessionId: string): Promise<SoapAuditResponse> {
  const response = await axios.get<SoapAuditResponse>(
    `${API_BASE}/doctor/sessions/${encodeURIComponent(sessionId)}/audit`,
    { validateStatus: (s) => s === 200 || s === 202 },
  );
  return response.data;
}

export function createAudioWebSocket(): WebSocket {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsHost = import.meta.env.VITE_WS_URL || `${wsProtocol}//${window.location.hostname}:8000`;
  return new WebSocket(`${wsHost}/api/doctor/stream-audio`);
}
