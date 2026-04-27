import axios from 'axios';
import type { ChatMessage, ChatResponse } from '../types/chatbot.types';

const API_BASE = import.meta.env.VITE_API_URL || '';

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
