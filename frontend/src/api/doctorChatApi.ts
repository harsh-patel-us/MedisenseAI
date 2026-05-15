import axios from 'axios';
import type { PatientChatSessionDetail } from '../types/patientChatbot.types';
import { getToken } from './authApi';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface DoctorChatActiveSession {
  id: string;
  patient_id: string;
  patient_name: string;
  started_at: string;
  title: string | null;
  doctor_joined: boolean;
  specialty: string | null;
  specialty_name: string | null;
}

export interface DoctorChatListItem {
  id: string;
  patient_id: string;
  patient_name: string;
  started_at: string;
  ended_at: string | null;
  title: string | null;
  specialty: string | null;
  specialty_name: string | null;
  session_mode: 'ai' | 'doctor';
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender: 'ai' | 'doctor' | 'patient' | null;
}

export interface DoctorChatListResponse {
  items: DoctorChatListItem[];
}

export async function getActivePatientChats(): Promise<DoctorChatActiveSession[]> {
  const { data } = await axios.get<DoctorChatActiveSession[]>(`${API_BASE}/doctor/active-chats`);
  return data;
}

export async function listDoctorChatSessions(): Promise<DoctorChatListResponse> {
  const { data } = await axios.get<DoctorChatListResponse>(`${API_BASE}/doctor/chat-sessions`);
  return data;
}

export async function getPatientChatForDoctor(sessionId: string): Promise<PatientChatSessionDetail> {
  const { data } = await axios.get<PatientChatSessionDetail>(`${API_BASE}/doctor/chat/${encodeURIComponent(sessionId)}`);
  return data;
}

export async function toggleChatAi(sessionId: string): Promise<{ doctor_joined: boolean; session_mode: 'ai' | 'doctor' }> {
  const { data } = await axios.post<{ doctor_joined: boolean; session_mode: 'ai' | 'doctor' }>(`${API_BASE}/doctor/chat/${encodeURIComponent(sessionId)}/toggle-ai`);
  return data;
}

export async function sendDoctorChatMessage(sessionId: string, message: string): Promise<void> {
  await axios.post(`${API_BASE}/doctor/chat/${encodeURIComponent(sessionId)}/message`, { message });
}

export async function updateDoctorChatMessage(messageId: string, content: string): Promise<void> {
  await axios.put(`${API_BASE}/patient/chat/message/${encodeURIComponent(messageId)}`, { content });
}

/** Open a WebSocket against a chat session so the doctor's UI can receive
 *  patient messages and mode-change events live. The bearer token is passed
 *  as a query param (browsers can't set headers on WS upgrades). */
export function openDoctorChatWebSocket(sessionId: string): WebSocket | null {
  const token = getToken();
  if (!token) return null;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = window.location.host;
  let pathPrefix = API_BASE;
  if (/^https?:\/\//.test(API_BASE)) {
    const url = new URL(API_BASE);
    pathPrefix = url.pathname.replace(/\/$/, '');
  }
  const url = `${proto}://${host}${pathPrefix}/patient/chat/ws/${encodeURIComponent(sessionId)}?token=${encodeURIComponent(token)}`;
  try {
    return new WebSocket(url);
  } catch {
    return null;
  }
}
