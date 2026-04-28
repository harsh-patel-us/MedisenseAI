export type PatientChatRole = 'user' | 'assistant';
export type PatientAttachmentKind = 'image' | 'pdf';

export interface ChatFileReference {
  filename: string;
  mime_type: string;
  size_bytes: number;
  kind: PatientAttachmentKind;
}

export interface ChatAttachmentUpload {
  filename: string;
  mime_type: string;
  data_base64: string;
  kind: PatientAttachmentKind;
}

export interface PatientChatMessage {
  id: string;
  role: PatientChatRole;
  content: string;
  created_at: string;
  file_references?: ChatFileReference[];
}

export interface PatientChatSessionSummary {
  id: string;
  started_at: string;
  ended_at: string | null;
  title: string | null;
  session_summary: string | null;
  message_count: number;
}

export interface PatientChatSendRequest {
  patient_id: string;
  session_id?: string | null;
  message?: string | null;
  attachments?: ChatAttachmentUpload[];
}

export interface PatientChatSendResponse {
  session_id: string;
  reply: string;
  is_new_session: boolean;
}

export interface PatientChatHistoryResponse {
  patient_id: string;
  sessions: PatientChatSessionSummary[];
}

export interface PatientChatSessionDetail {
  session_id: string;
  patient_id: string;
  started_at: string;
  ended_at: string | null;
  session_summary: string | null;
  messages: PatientChatMessage[];
}

export interface EndSessionResponse {
  session_id: string;
  ended_at: string;
  summary_generated: boolean;
}
