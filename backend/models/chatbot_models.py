"""
chatbot_models.py — Pydantic schemas for the website chatbot widget.

The widget owns the conversation history and replays it on every turn, so
the backend is fully stateless: send {messages}, receive {reply}.
"""
from typing import List, Literal

from pydantic import BaseModel, Field


ChatRole = Literal["user", "assistant"]


class ChatMessage(BaseModel):
    role: ChatRole
    content: str = Field(..., min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    """Full conversation, with the latest user turn last."""
    messages: List[ChatMessage] = Field(..., min_length=1, max_length=40)


class ChatResponse(BaseModel):
    reply: str
