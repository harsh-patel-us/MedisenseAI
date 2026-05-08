export type PatientChatRole = 'user' | 'assistant' | 'doctor';
export type PatientSenderType = 'ai' | 'doctor' | 'patient';
export type PatientAttachmentKind = 'image' | 'pdf';

export interface ChatFileReference {
  filename: string;
  mime_type: string;
  size_bytes: number;
  kind: PatientAttachmentKind;
  /** Server-assigned id of the persisted attachment row. Absent on optimistic
   *  client-side refs (set by the server once the message is committed). */
  attachment_id?: string;
}

export interface ChatAttachmentUpload {
  filename: string;
  mime_type: string;
  data_base64: string;
  kind: PatientAttachmentKind;
}

export type EmergencySeverity =
  | 'immediate_911'
  | 'urgent_er'
  | 'see_doctor_today'
  | 'none';

export interface EmergencyAlert {
  severity: EmergencySeverity | string;
  detected_symptoms: string[];
  emergency_message: string | null;
  contacts: Record<string, string>;
}

export interface PatientChatMessage {
  id: string;
  role: PatientChatRole;
  content: string;
  created_at: string;
  file_references?: ChatFileReference[];
  sender_type?: PatientSenderType | null;
  sender_id?: string | null;
  sender_name?: string | null;
  emergency_alert?: EmergencyAlert | null;
}

export interface PatientChatSessionSummary {
  id: string;
  started_at: string;
  ended_at: string | null;
  title: string | null;
  session_summary: string | null;
  message_count: number;
  doctor_joined: boolean;
  specialty: string | null;
  specialty_name: string | null;
  assigned_doctor_id?: string | null;
  assigned_doctor_name?: string | null;
  session_mode?: 'ai' | 'doctor';
}

export interface PatientChatSendRequest {
  patient_id: string;
  session_id?: string | null;
  message?: string | null;
  attachments?: ChatAttachmentUpload[];
  specialty?: string | null;
  assigned_doctor_id?: string | null;
}

export interface DoctorCard {
  id: string;
  full_name: string;
  specialty: string | null;
  specialty_name: string | null;
}

export interface DoctorListResponse {
  doctors: DoctorCard[];
}

export interface SpecialtyOption {
  id: string;
  name: string;
  description: string;
}

export interface SpecialtiesResponse {
  specialties: SpecialtyOption[];
}

export interface PatientChatSendResponse {
  session_id: string;
  reply: string;
  is_new_session: boolean;
  emergency_alert?: EmergencyAlert | null;
}

export interface PatientChatHistoryResponse {
  patient_id: string;
  sessions: PatientChatSessionSummary[];
}

export interface PatientChatSessionDetail {
  session_id: string;
  patient_id: string;
  patient_name?: string | null;
  started_at: string;
  ended_at: string | null;
  session_summary: string | null;
  messages: PatientChatMessage[];
  doctor_joined: boolean;
  specialty: string | null;
  specialty_name: string | null;
  assigned_doctor_id?: string | null;
  assigned_doctor_name?: string | null;
  session_mode?: 'ai' | 'doctor';
}

export interface EndSessionResponse {
  session_id: string;
  ended_at: string;
  summary_generated: boolean;
}
