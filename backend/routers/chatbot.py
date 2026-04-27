"""
chatbot.py — Public website-chatbot router.

POST /chatbot/message
  request:  { "messages": [{ "role": "user"|"assistant", "content": str }, ...] }
  response: { "reply": str }

Stateless: the widget keeps the conversation in browser memory and replays it
on every turn. The reply is produced by a multi-agent pipeline (triage →
platform-support / health-info) running on the OpenAI Agents SDK, with all
LLM calls routed through OpenRouter (model: openai/gpt-4o-mini).
"""
import logging

from fastapi import APIRouter, HTTPException

from models.chatbot_models import ChatRequest, ChatResponse
from services.chatbot_agent import run_chatbot

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chatbot", tags=["chatbot"])


@router.post("/message", response_model=ChatResponse)
async def send_message(request: ChatRequest) -> ChatResponse:
    messages = [m.model_dump() for m in request.messages]
    try:
        reply = await run_chatbot(messages)
    except ValueError as exc:
        # Bad input from the client — surfaces normalization failures.
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        # Missing config (OPENROUTER_API_KEY, etc.).
        logger.error(f"Chatbot misconfigured: {exc}")
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.error(f"Chatbot agent run failed: {exc}", exc_info=True)
        raise HTTPException(status_code=502, detail="Chatbot service unavailable.")
    return ChatResponse(reply=reply)
