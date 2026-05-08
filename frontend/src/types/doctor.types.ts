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

export interface UploadAudioResponse {
  session_id: string;
  transcript: TranscriptSegment[];
  raw_text: string;
}

// ── Second-opinion SOAP audit ────────────────────────────────────────

export type AuditPriority = 'high' | 'medium' | 'low';
export type AuditQuality =
  | 'excellent'
  | 'good'
  | 'adequate'
  | 'needs_improvement'
  | '';
export type AuditStatus = 'pending' | 'complete' | 'failed';

export interface AuditIssue {
  issue: string;
  recommendation: string;
  priority: AuditPriority | string;
}

export interface SoapAuditResponse {
  status: AuditStatus | string;
  overall_quality: AuditQuality | string;
  overall_score: number;
  critical_issues: AuditIssue[];
  missing_differentials: string[];
  documentation_gaps: string[];
  positive_findings: string[];
  reviewer_summary: string;
}

// ── Follow-up plan ───────────────────────────────────────────────────

export type FollowUpStatus = 'pending' | 'complete' | string;

export interface FollowUpMedication {
  drug: string;
  dose: string;
  frequency: string;
}

export interface FollowUpPlan {
  status: FollowUpStatus;
  id: string | null;
  consultation_session_id: string | null;
  patient_id: string | null;
  follow_up_date: string | null;
  follow_up_reason: string;
  monitoring_items: string[];
  warning_signs: string[];
  dietary_restrictions: string[];
  activity_restrictions: string[];
  medications_to_start: FollowUpMedication[];
  follow_up_specialist: string | null;
  patient_instructions: string;
  is_sent_to_patient: boolean;
  created_at: string | null;
}
