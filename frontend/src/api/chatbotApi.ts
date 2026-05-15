import axios from 'axios';
import type { ChatMessage, ChatResponse } from '../types/chatbot.types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export async function sendChatbotMessage(
  messages: ChatMessage[],
  sessionId: string | null,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  const { data } = await axios.post<ChatResponse>(
    `${API_BASE}/chatbot/message`,
    { messages, session_id: sessionId },
    { timeout: 30000, signal },
  );
  return data;
}

export async function getChatbotSession(sessionId: string): Promise<ChatMessage[]> {
  const { data } = await axios.get<ChatMessage[]>(
    `${API_BASE}/chatbot/session/${encodeURIComponent(sessionId)}`,
  );
  return data;
}

export async function updateChatbotMessage(
  messageId: string,
  content: string,
): Promise<ChatMessage> {
  const { data } = await axios.put<ChatMessage>(
    `${API_BASE}/chatbot/message/${encodeURIComponent(messageId)}`,
    { content },
  );
  return data;
}
