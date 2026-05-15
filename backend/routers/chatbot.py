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
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import ChatbotSession, ChatbotMessage, User, get_db
from models.chatbot_models import ChatRequest, ChatResponse, UpdateChatbotMessageRequest, ChatMessage
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
        # We only pass the content to the agent, not the DB metadata.
        reply = await run_chatbot([{"role": m.role, "content": m.content} for m in request.messages])
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
            message_count=0,
        )
        db.add(session)
        await db.flush()

    user_msg_id = generate_id()
    db.add(ChatbotMessage(
        id=user_msg_id,
        session_id=session.id,
        role="user",
        content=latest_user_msg,
    ))

    ai_msg_id = generate_id()
    db.add(ChatbotMessage(
        id=ai_msg_id,
        session_id=session.id,
        role="assistant",
        content=reply,
    ))

    session.message_count += 2
    await db.commit()

    return ChatResponse(
        session_id=session.id,
        reply=reply,
        user_message_id=user_msg_id,
        assistant_message_id=ai_msg_id,
    )


@router.get("/session/{session_id}", response_model=List[ChatMessage])
async def get_session(
    session_id: str = Path(...),
    db: AsyncSession = Depends(get_db),
) -> List[ChatMessage]:
    """Retrieve the full transcript of a public-website chatbot session."""
    result = await db.execute(
        select(ChatbotMessage)
        .where(ChatbotMessage.session_id == session_id)
        .where(ChatbotMessage.is_deleted == False)
        .order_by(ChatbotMessage.created_at.asc())
    )
    messages = result.scalars().all()

    return [
        ChatMessage(
            id=m.id,
            role=m.role,  # type: ignore[arg-type]
            content=m.content,
            created_at=m.created_at,
            updated_at=m.updated_at,
        )
        for m in messages
    ]


@router.put("/message/{message_id}", response_model=ChatMessage)
async def update_message(
    payload: UpdateChatbotMessageRequest,
    message_id: str = Path(...),
    db: AsyncSession = Depends(get_db),
) -> ChatMessage:
    """Update the content of a public-website chatbot message.
    Anyone with the message ID can edit (stateless sessions)."""
    result = await db.execute(
        select(ChatbotMessage).where(ChatbotMessage.id == message_id)
    )
    msg = result.scalar_one_or_none()

    if msg is None:
        raise HTTPException(status_code=404, detail="Message not found.")

    if msg.role != "user":
        raise HTTPException(
            status_code=400,
            detail="Only user messages can be edited.",
        )

    msg.content = payload.content.strip()
    msg.updated_at = datetime.utcnow()

    # Mark subsequent messages as deleted.
    await db.execute(
        ChatbotMessage.__table__.update()
        .where(ChatbotMessage.session_id == msg.session_id)
        .where(ChatbotMessage.created_at > msg.created_at)
        .values(is_deleted=True)
    )

    await db.commit()

    # AI Regeneration for generic chatbot.
    result = await db.execute(
        select(ChatbotMessage)
        .where(ChatbotMessage.session_id == msg.session_id)
        .where(ChatbotMessage.is_deleted == False)
        .order_by(ChatbotMessage.created_at.asc())
    )
    history_rows = result.scalars().all()
    history_dicts = [{"role": m.role, "content": m.content} for m in history_rows]

    try:
        reply = await run_chatbot(history_dicts)
        ai_msg_id = generate_id()
        db.add(ChatbotMessage(
            id=ai_msg_id,
            session_id=msg.session_id,
            role="assistant",
            content=reply,
        ))
        await db.commit()
    except Exception as exc:
        logger.error(f"Chatbot regeneration failed: {exc}")
        # We still return the user message update even if regeneration fails.

    await db.refresh(msg)

    return ChatMessage(
        id=msg.id,
        role=msg.role,  # type: ignore[arg-type]
        content=msg.content,
        created_at=msg.created_at,
        updated_at=msg.updated_at,
    )
