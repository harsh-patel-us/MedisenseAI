"""
google_oauth.py — Per-user Google account connection.

GET  /integrations/google/status     — returns { connected, email }
GET  /integrations/google/auth-url   — returns the OAuth URL the frontend should redirect to
GET  /integrations/google/callback   — Google redirects back here with a `code`
POST /integrations/google/disconnect — revoke locally (clears stored tokens)

The auth-url endpoint stores a short-lived state token mapped to the
authenticated user_id, so when Google redirects to /callback (which is NOT
authenticated by JWT — Google can't carry our headers) we can still tell
which MediSense user is connecting.
"""
from __future__ import annotations

import logging
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import User, get_db
from services.auth_service import get_current_user
from services.google_calendar import (
    build_authorization_url,
    clear_credentials,
    exchange_code_for_tokens,
    is_connected,
    new_state_token,
    persist_credentials,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/integrations/google", tags=["integrations-google"])


# ── In-memory state-token store ──────────────────────────────────────────
# Maps OAuth `state` → (user_id, created_at_epoch). Tokens expire after 10
# minutes. This is intentionally process-local: OAuth flows complete in
# under a minute and we never need to persist the binding.
_PENDING_STATE: dict[str, tuple[str, float]] = {}
_STATE_TTL_SECONDS = 600


def _put_state(user_id: str) -> str:
    state = new_state_token()
    _PENDING_STATE[state] = (user_id, time.time())
    _gc_state()
    return state


def _take_state(state: str) -> Optional[str]:
    entry = _PENDING_STATE.pop(state, None)
    if not entry:
        return None
    user_id, created = entry
    if time.time() - created > _STATE_TTL_SECONDS:
        return None
    return user_id


def _gc_state() -> None:
    now = time.time()
    expired = [k for k, (_, t) in _PENDING_STATE.items() if now - t > _STATE_TTL_SECONDS]
    for k in expired:
        _PENDING_STATE.pop(k, None)


# ── Endpoints ────────────────────────────────────────────────────────────

@router.get("/status")
async def status(user: User = Depends(get_current_user)) -> dict:
    return {
        "connected": is_connected(user),
        "email": user.google_email if is_connected(user) else None,
    }


@router.get("/auth-url")
async def auth_url(user: User = Depends(get_current_user)) -> dict:
    """Return the URL the frontend should send the user to in a popup or
    full-page redirect to start the OAuth flow."""
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=503,
            detail=(
                "Google Calendar integration is not configured on this server."
            ),
        )
    state = _put_state(user.id)
    url, _state = build_authorization_url(state=state)
    return {"auth_url": url, "state": state}


@router.get("/callback")
async def callback(
    request: Request,
    code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """Google redirects here after the user grants/denies access. Bounce
    them back to the frontend afterwards with a status query string."""
    redirect_base = settings.google_post_auth_redirect

    if error:
        logger.info(f"Google OAuth denied: {error}")
        return RedirectResponse(f"{redirect_base}?google=denied")

    if not code or not state:
        return RedirectResponse(f"{redirect_base}?google=error")

    user_id = _take_state(state)
    if not user_id:
        return RedirectResponse(f"{redirect_base}?google=invalid_state")

    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if not user:
        return RedirectResponse(f"{redirect_base}?google=user_missing")

    try:
        tokens = exchange_code_for_tokens(code, state=state)
        await persist_credentials(db, user, tokens)
    except Exception as exc:
        logger.error(f"Google OAuth callback failed: {exc}", exc_info=True)
        return RedirectResponse(f"{redirect_base}?google=error")

    logger.info(f"Google account connected for user {user.id} ({tokens.get('email')})")
    return RedirectResponse(f"{redirect_base}?google=connected")


@router.post("/disconnect")
async def disconnect(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    await clear_credentials(db, user)
    return {"connected": False, "email": None}
