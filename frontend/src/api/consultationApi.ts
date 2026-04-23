import axios from 'axios';
import type {
  CreateRoomResponse,
  RoomInfo,
  ScheduleRoomRequest,
  ScheduledMeeting,
} from '../types/consultation.types';

const API = '';

export async function createRoom(
  doctorName: string,
  patientName: string,
): Promise<CreateRoomResponse> {
  const { data } = await axios.post(`${API}/consultation/create`, {
    doctor_name: doctorName,
    patient_name: patientName,
  });
  return data;
}

export async function scheduleConsultation(
  request: ScheduleRoomRequest,
): Promise<ScheduledMeeting> {
  const { data } = await axios.post(`${API}/consultation/schedule`, request);
  return data;
}

export async function listScheduledMeetings(): Promise<ScheduledMeeting[]> {
  const { data } = await axios.get(`${API}/consultation/scheduled`);
  return data.meetings || [];
}

export async function getRoomInfo(roomId: string): Promise<RoomInfo> {
  const { data } = await axios.get(`${API}/consultation/room/${roomId}`);
  return data;
}

export async function exportSoapPdf(roomId: string): Promise<Blob> {
  const { data } = await axios.post(
    `${API}/consultation/export-soap-pdf/${roomId}`,
    {},
    { responseType: 'blob' },
  );
  return data;
}

export async function exportPatientPdf(roomId: string): Promise<Blob> {
  const { data } = await axios.post(
    `${API}/consultation/export-patient-pdf/${roomId}`,
    {},
    { responseType: 'blob' },
  );
  return data;
}

export function createConsultationWebSocket(roomId: string, role: string): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return new WebSocket(
    `${protocol}//${host}/consultation/ws/${roomId}?role=${role}`,
  );
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
