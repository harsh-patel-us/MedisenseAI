export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  session_id?: string | null;
}

export interface ChatResponse {
  session_id: string;
  reply: string;
}
