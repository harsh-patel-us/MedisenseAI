export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id?: string;
  role: ChatRole;
  content: string;
  created_at?: string;
  updated_at?: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  session_id?: string | null;
}

export interface ChatResponse {
  session_id: string;
  reply: string;
  user_message_id?: string;
  assistant_message_id?: string;
}
