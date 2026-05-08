export type MedicationSource =
  | 'prescription_upload'
  | 'chatbot_mention'
  | 'manual';

export type InteractionSeverity =
  | 'contraindicated'
  | 'major'
  | 'moderate'
  | 'minor';

export interface PatientMedication {
  id: string;
  drug_name: string;
  dosage: string | null;
  frequency: string | null;
  prescribed_by: string | null;
  start_date: string | null;
  is_active: boolean;
  source: MedicationSource | string;
  notes: string | null;
  created_at: string;
}

export interface MedicationListResponse {
  patient_id: string;
  medications: PatientMedication[];
}

export interface AddMedicationRequest {
  drug_name: string;
  dosage?: string | null;
  frequency?: string | null;
  notes?: string | null;
}

export interface MedicationInteractionAlert {
  id: string;
  drug_a: string;
  drug_b: string;
  severity: InteractionSeverity | string;
  description: string | null;
  source: string;
  created_at: string;
  is_dismissed: boolean;
}

export interface InteractionListResponse {
  patient_id: string;
  alerts: MedicationInteractionAlert[];
}

export interface AdherenceReminderResponse {
  patient_id: string;
  message: string;
}

export interface MedicationTrackerProps {
  patientId: string;
}
