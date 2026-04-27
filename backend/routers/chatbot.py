"""
chatbot.py — Public website-chatbot router.

POST /chatbot/message
  request:  { messages: [{role, content}, ...], session_id?: str }
  response: { session_id: str, reply: str }

The reply is produced by a multi-agent pipeline (triage → platform-support /
health-info) running on the OpenAI Agents SDK, with all LLM calls routed
through OpenRouter (model: openai/gpt-4o-mini). Every turn (user message and
the agent's reply) is appended to a `ChatbotSession` row keyed by session_id
so the full transcript is auditable.
"""
import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import ChatbotSession, User, get_db
from models.chatbot_models import ChatRequest, ChatResponse
from services.auth_service import decode_token
from services.chatbot_agent import run_chatbot
from utils.helpers import generate_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chatbot", tags=["chatbot"])


async def _maybe_user_id(authorization: Optional[str], db: AsyncSession) -> Optional[str]:
    """Best-effort extraction of a user id from a Bearer token. Never raises."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        payload = decode_token(token)
    except HTTPException:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    result = await db.execute(select(User.id).where(User.id == user_id))
    return result.scalar_one_or_none()


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


@router.post("/message", response_model=ChatResponse)
async def send_message(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
) -> ChatResponse:
    if request.messages[-1].role != "user":
        raise HTTPException(status_code=400, detail="Conversation must end with a user message.")
    latest_user_msg = request.messages[-1].content.strip()
    if not latest_user_msg:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    # Run the agent pipeline.
    try:
        reply = await run_chatbot([m.model_dump() for m in request.messages])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        logger.error(f"Chatbot misconfigured: {exc}")
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.error(f"Chatbot agent run failed: {exc}", exc_info=True)
        raise HTTPException(status_code=502, detail="Chatbot service unavailable.")

    # Load or create the session, then append this turn's two messages.
    session: Optional[ChatbotSession] = None
    if request.session_id:
        result = await db.execute(
            select(ChatbotSession).where(ChatbotSession.id == request.session_id)
        )
        session = result.scalar_one_or_none()

    if session is None:
        session = ChatbotSession(
            id=request.session_id or generate_id(),
            user_id=await _maybe_user_id(authorization, db),
            messages=json.dumps([]),
            message_count=0,
        )
        db.add(session)

    try:
        history = json.loads(session.messages or "[]")
        if not isinstance(history, list):
            history = []
    except json.JSONDecodeError:
        history = []

    now = _now_iso()
    history.append({"role": "user", "content": latest_user_msg, "created_at": now})
    history.append({"role": "assistant", "content": reply, "created_at": now})

    session.messages = json.dumps(history)
    session.message_count = len(history)
    await db.commit()

    return ChatResponse(session_id=session.id, reply=reply)
