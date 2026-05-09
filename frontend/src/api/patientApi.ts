import axios from 'axios';
import type {
  BiomarkerTrendResponse,
  UploadResponse,
  PatientAnalysis,
  HistoryListResponse,
  HistoryDetail,
  WearableDataRecord,
  WearableRecordListResponse,
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

export async function getBiomarkerTrends(
  patientId: string,
): Promise<BiomarkerTrendResponse> {
  const { data } = await axios.get<BiomarkerTrendResponse>(
    `${API_BASE}/patient/${encodeURIComponent(patientId)}/biomarker-trends`,
  );
  return data;
}

/* ── Wearable / health-app data ─────────────────────────────────────── */

export async function uploadWearableData(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<WearableDataRecord> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await axios.post<WearableDataRecord>(
    `${API_BASE}/patient/wearable/upload`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      // Wearable exports take a while; allow up to 5 min for parse + AI call.
      timeout: 5 * 60 * 1000,
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      },
    },
  );
  return data;
}

export async function getWearableRecords(
  patientId: string,
): Promise<WearableRecordListResponse> {
  const { data } = await axios.get<WearableRecordListResponse>(
    `${API_BASE}/patient/${encodeURIComponent(patientId)}/wearable-records`,
  );
  return data;
}

export async function getWearableRecord(
  recordId: string,
): Promise<WearableDataRecord> {
  const { data } = await axios.get<WearableDataRecord>(
    `${API_BASE}/patient/wearable/${encodeURIComponent(recordId)}`,
  );
  return data;
}
