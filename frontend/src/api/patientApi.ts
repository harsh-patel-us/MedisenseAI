import axios from 'axios';
import type {
  UploadResponse,
  PatientAnalysis,
  HistoryListResponse,
  HistoryDetail,
} from '../types/patient.types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export async function uploadReport(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await axios.post<UploadResponse>(
    `${API_BASE}/patient/upload`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    }
  );
  return response.data;
}

export async function analyzeReport(
  fileId: string,
  rawText: string
): Promise<PatientAnalysis> {
  const response = await axios.post<PatientAnalysis>(
    `${API_BASE}/patient/analyze`,
    { file_id: fileId, raw_text: rawText },
    { timeout: 120000 } // 2 min timeout — 3 AI calls
  );
  return response.data;
}

export async function exportPatientPdf(
  analysisResult: PatientAnalysis,
  patientName?: string,
  fileId?: string
): Promise<Blob> {
  const response = await axios.post(
    `${API_BASE}/patient/export-pdf`,
    {
      analysis_result: analysisResult,
      patient_name: patientName || 'Patient',
      file_id: fileId,
    },
    { responseType: 'blob' }
  );
  return response.data;
}

/* ── History ──────────────────────────────────────────────────────────── */

export async function listPatientHistory(): Promise<HistoryListResponse> {
  const { data } = await axios.get<HistoryListResponse>(
    `${API_BASE}/patient/history`,
  );
  return data;
}

export async function getPatientHistoryItem(
  recordId: string,
): Promise<HistoryDetail> {
  const { data } = await axios.get<HistoryDetail>(
    `${API_BASE}/patient/history/${encodeURIComponent(recordId)}`,
  );
  return data;
}

export async function downloadHistoryUpload(recordId: string): Promise<Blob> {
  const response = await axios.get(
    `${API_BASE}/patient/history/${encodeURIComponent(recordId)}/file`,
    { responseType: 'blob' },
  );
  return response.data;
}

export async function downloadHistoryPdf(recordId: string): Promise<Blob> {
  const response = await axios.get(
    `${API_BASE}/patient/history/${encodeURIComponent(recordId)}/pdf`,
    { responseType: 'blob' },
  );
  return response.data;
}
