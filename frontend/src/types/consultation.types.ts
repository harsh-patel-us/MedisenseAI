export type ConsultationRole = 'doctor' | 'patient';
export type CallStatus = 'waiting' | 'connecting' | 'active' | 'ending' | 'ended';

export interface ConsultationTranscriptSegment {
  speaker: 'DOCTOR' | 'PATIENT';
  text: string;
  timestamp: string;
  confidence: number;
}

export interface Medication {
  name: string;
  what_it_does: string;
  how_to_take: string;
  side_effects_to_watch: string;
}

export interface TestOrdered {
  test: string;
  why: string;
}

export interface PatientExplanation {
  greeting: string;
  what_was_found: {
    diagnosis: string;
    in_simple_terms: string;
    why_this_happened: string;
    what_it_means_for_you: string;
  };
  your_treatment: {
    overview: string;
    medications: Medication[];
    tests_ordered: TestOrdered[];
  };
  what_to_do_next: {
    immediate_steps: string[];
    lifestyle_changes: string[];
    follow_up: string;
    when_to_seek_help_immediately: string[];
  };
  reassurance: string;
}

export interface PostCallData {
  soap_note?: Record<string, unknown>;
  patient_explanation?: PatientExplanation;
  transcript: ConsultationTranscriptSegment[];
  session_id: string;
  error?: string;
}

export interface RoomInfo {
  room_id: string;
  session_id: string;
  doctor_name: string;
  patient_name: string;
  status: string;
  doctor_connected: boolean;
  patient_connected: boolean;
  scheduled_at?: string | null;
  duration_minutes?: number | null;
  reason?: string | null;
}

export interface CreateRoomResponse {
  room_id: string;
  session_id: string;
  doctor_name: string;
  patient_name: string;
  status: string;
}

export interface ScheduleRoomRequest {
  doctor_name: string;
  patient_name: string;
  patient_email?: string;
  doctor_email?: string;
  scheduled_at: string;
  duration_minutes: number;
  reason: string;
}

export type GoogleInviteStatus = 'sent' | 'skipped' | 'failed';

export interface ScheduledMeeting {
  room_id: string;
  session_id: string;
  doctor_name: string;
  patient_name: string;
  patient_email?: string | null;
  doctor_email?: string | null;
  scheduled_at: string;
  duration_minutes: number;
  reason: string;
  status: string;
  created_at: string;
  organizer_role?: 'doctor' | 'patient' | null;
  meet_link?: string | null;
  google_event_id?: string | null;
  google_event_link?: string | null;
  google_invite_status?: GoogleInviteStatus;
  google_invite_error?: string | null;
}

export interface GoogleConnectionStatus {
  connected: boolean;
  email: string | null;
}

export interface GoogleAuthUrlResponse {
  auth_url: string;
  state: string;
}
