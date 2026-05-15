"""
chatbot_models.py — Pydantic schemas for the website chatbot widget.

The widget owns the conversation state in browser memory and replays it on
every turn. The backend is therefore stateless from a routing perspective,
but it does persist each session and turn to the database for audit / review.
"""
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


ChatRole = Literal["user", "assistant"]


class ChatMessage(BaseModel):
    id: Optional[str] = None
    role: ChatRole
    content: str = Field(..., min_length=1, max_length=4000)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ChatRequest(BaseModel):
    """Full conversation, with the latest user turn last.

    `session_id` is omitted on the very first turn — the server returns a fresh
    one in the response. The widget then stores it (sessionStorage) and replays
    it on every subsequent turn so the DB sees one row per visitor session.
    """
    messages: List[ChatMessage] = Field(..., min_length=1, max_length=100)
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    user_message_id: Optional[str] = None
    assistant_message_id: Optional[str] = None


class UpdateChatbotMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)
