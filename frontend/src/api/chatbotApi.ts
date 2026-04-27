import axios from 'axios';
import type { ChatMessage, ChatResponse } from '../types/chatbot.types';

const API_BASE = import.meta.env.VITE_API_URL || '';

export async function sendChatbotMessage(
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const { data } = await axios.post<ChatResponse>(
    `${API_BASE}/chatbot/message`,
    { messages },
    { timeout: 30000, signal },
  );
  return data.reply;
}
