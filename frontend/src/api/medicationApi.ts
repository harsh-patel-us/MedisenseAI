import axios from 'axios';
import type {
  AddMedicationRequest,
  AdherenceReminderResponse,
  InteractionListResponse,
  MedicationInteractionAlert,
  MedicationListResponse,
  PatientMedication,
} from '../types/medication.types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export async function getMedications(
  patientId: string,
): Promise<MedicationListResponse> {
  const { data } = await axios.get<MedicationListResponse>(
    `${API_BASE}/medications/${encodeURIComponent(patientId)}`,
  );
  return data;
}

export async function addMedication(
  patientId: string,
  body: AddMedicationRequest,
): Promise<PatientMedication> {
  const { data } = await axios.post<PatientMedication>(
    `${API_BASE}/medications/${encodeURIComponent(patientId)}/add`,
    body,
  );
  return data;
}

export async function deleteMedication(
  patientId: string,
  medId: string,
): Promise<PatientMedication> {
  const { data } = await axios.delete<PatientMedication>(
    `${API_BASE}/medications/${encodeURIComponent(patientId)}/${encodeURIComponent(medId)}`,
  );
  return data;
}

export async function getInteractions(
  patientId: string,
): Promise<InteractionListResponse> {
  const { data } = await axios.get<InteractionListResponse>(
    `${API_BASE}/medications/${encodeURIComponent(patientId)}/interactions`,
    { timeout: 60000 },
  );
  return data;
}

export async function dismissAlert(
  patientId: string,
  alertId: string,
): Promise<MedicationInteractionAlert> {
  const { data } = await axios.post<MedicationInteractionAlert>(
    `${API_BASE}/medications/${encodeURIComponent(patientId)}/dismiss-alert/${encodeURIComponent(alertId)}`,
  );
  return data;
}

export async function getAdherenceReminder(
  patientId: string,
): Promise<AdherenceReminderResponse> {
  const { data } = await axios.get<AdherenceReminderResponse>(
    `${API_BASE}/medications/${encodeURIComponent(patientId)}/adherence-reminder`,
    { timeout: 60000 },
  );
  return data;
}
