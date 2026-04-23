export interface TranscriptSegment {
  speaker: 'DOCTOR' | 'PATIENT';
  text: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface SoapNoteSubjective {
  chief_complaint: string;
  history_of_present_illness: string;
  review_of_systems: string;
  patient_reported_medications: string;
}

export interface SoapNoteObjective {
  vitals: string;
  physical_examination: string;
  relevant_findings: string;
}

export interface SoapNoteAssessment {
  primary_diagnosis: string;
  differential_diagnoses: string;
  clinical_impression: string;
}

export interface SoapNotePlan {
  investigations_ordered: string;
  medications_prescribed: string;
  referrals: string;
  patient_instructions: string;
  follow_up: string;
}

export interface SoapNote {
  subjective: SoapNoteSubjective;
  objective: SoapNoteObjective;
  assessment: SoapNoteAssessment;
  plan: SoapNotePlan;
}

export interface MedicalEntities {
  symptoms: string[];
  medications: string[];
  diagnoses: string[];
  vitals: string[];
  allergies: string[];
}

export interface GenerateNoteResponse {
  soap_note: SoapNote;
  entities: MedicalEntities;
  session_id: string;
}

export interface SessionInfo {
  id: string;
  created_at: string;
  doctor_name: string | null;
  patient_identifier: string | null;
  status: string;
}
