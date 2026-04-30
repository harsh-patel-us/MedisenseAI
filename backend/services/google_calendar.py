"""
google_calendar.py — Google OAuth + Calendar event creation for MediSense AI.

Each MediSense user can connect their own Google account from the schedule
page. When a connected user organizes a consultation, we insert an event on
their primary calendar with a Google Meet link via `conferenceData`, and
list the other party as an attendee — Google emails them the invite.

Public surface
--------------
build_authorization_url(state)        → (auth_url, state)
exchange_code_for_tokens(code)        → token dict (access, refresh, expiry, scopes, email)
persist_credentials(db, user, tokens) → None  (writes the columns on User)
clear_credentials(db, user)           → None
is_connected(user)                    → bool
get_connected_email(user)             → Optional[str]

create_meeting_event(
    db, organizer, attendee_email, attendee_name,
    title, description, start_iso, duration_minutes,
)                                      → CalendarEventResult
"""
from __future__ import annotations

import asyncio
import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import User

logger = logging.getLogger(__name__)


GOOGLE_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/calendar.events",
]


# ── Result types ─────────────────────────────────────────────────────────

@dataclass
class CalendarEventResult:
    event_id: str
    html_link: str            # link to view the event on Google Calendar
    meet_link: Optional[str]  # https://meet.google.com/... when conferenceData succeeded
    organizer_email: str


# ── OAuth flow helpers ───────────────────────────────────────────────────

def _client_config() -> dict:
    """Build the in-memory client_config Google's Flow expects.

    Avoids shipping a `client_secret.json` file — the values come from .env.
    """
    if not settings.google_client_id or not settings.google_client_secret:
        raise RuntimeError(
            "Google OAuth is not configured. Set GOOGLE_CLIENT_ID / "
            "GOOGLE_CLIENT_SECRET in backend/.env."
        )
    return {
        "web": {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [settings.google_redirect_uri],
        }
    }


def _build_flow(state: Optional[str] = None) -> Flow:
    flow = Flow.from_client_config(
        _client_config(),
        scopes=GOOGLE_SCOPES,
        state=state,
    )
    flow.redirect_uri = settings.google_redirect_uri
    return flow


def build_authorization_url(state: str | None = None) -> tuple[str, str]:
    """Return (auth_url, state). Pass `state` to bind the request to a user."""
    flow = _build_flow(state=state)
    auth_url, returned_state = flow.authorization_url(
        access_type="offline",       # request a refresh token
        include_granted_scopes="true",
        prompt="consent",            # always re-grant so we get a fresh refresh token
    )
    return auth_url, returned_state


def exchange_code_for_tokens(code: str, state: Optional[str] = None) -> dict:
    """Exchange an OAuth callback `code` for token + identity info."""
    flow = _build_flow(state=state)
    flow.fetch_token(code=code)
    creds: Credentials = flow.credentials

    # Look up the connected user's email so we can persist it. id_token has
    # `email`; if it's missing (rare), fall back to the userinfo endpoint.
    email = None
    if creds.id_token:
        try:
            from google.oauth2 import id_token as gid
            from google.auth.transport import requests as g_requests

            info = gid.verify_oauth2_token(
                creds.id_token, g_requests.Request(), settings.google_client_id
            )
            email = info.get("email")
        except Exception as exc:  # pragma: no cover — defensive
            logger.warning(f"Failed to parse id_token for email: {exc}")

    if not email:
        try:
            service = build("oauth2", "v2", credentials=creds, cache_discovery=False)
            email = service.userinfo().get().execute().get("email")
        except Exception as exc:
            logger.warning(f"Failed to fetch userinfo email: {exc}")

    return {
        "access_token": creds.token,
        "refresh_token": creds.refresh_token,
        "expiry": creds.expiry,                  # naive UTC datetime
        "scopes": " ".join(creds.scopes or []),
        "email": email,
    }


# ── Persistence ──────────────────────────────────────────────────────────

async def persist_credentials(db: AsyncSession, user: User, tokens: dict) -> None:
    user.google_email = tokens.get("email")
    # Some flows return no refresh_token if the user already granted before
    # without prompt=consent — keep any prior refresh_token in that case.
    new_refresh = tokens.get("refresh_token")
    if new_refresh:
        user.google_refresh_token = new_refresh
    user.google_access_token = tokens.get("access_token")
    expiry = tokens.get("expiry")
    if isinstance(expiry, datetime):
        user.google_token_expiry = expiry
    user.google_scopes = tokens.get("scopes")
    await db.commit()


async def clear_credentials(db: AsyncSession, user: User) -> None:
    user.google_email = None
    user.google_refresh_token = None
    user.google_access_token = None
    user.google_token_expiry = None
    user.google_scopes = None
    await db.commit()


def is_connected(user: User) -> bool:
    return bool(user.google_refresh_token)


def get_connected_email(user: User) -> Optional[str]:
    return user.google_email if is_connected(user) else None


def platform_is_configured() -> bool:
    """True when a server-wide Google account has been set up via
    `scripts/setup_google_calendar.py`. Used as the fallback path so users
    don't have to connect their own Google account to send invites."""
    return bool(
        settings.google_client_id
        and settings.google_client_secret
        and settings.google_refresh_token
    )


def _platform_credentials() -> Credentials:
    if not platform_is_configured():
        raise RuntimeError("Platform Google credentials are not configured.")
    creds = Credentials(
        token=None,
        refresh_token=settings.google_refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        scopes=GOOGLE_SCOPES,
    )
    # Force a refresh on first use so creds.token is populated.
    creds.refresh(GoogleAuthRequest())
    return creds


def calendar_invite_available(user: User) -> bool:
    """True when EITHER the user's personal Google is connected OR the
    server-wide platform account is configured."""
    return is_connected(user) or platform_is_configured()


# ── Credentials → Google API client ──────────────────────────────────────

def _credentials_for(user: User) -> Credentials:
    if not is_connected(user):
        raise RuntimeError("User has not connected a Google account.")
    creds = Credentials(
        token=user.google_access_token,
        refresh_token=user.google_refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        scopes=(user.google_scopes or "").split() or GOOGLE_SCOPES,
    )
    if user.google_token_expiry:
        # Google's library uses naive UTC for `expiry`.
        creds.expiry = user.google_token_expiry
    return creds


async def _refresh_if_needed(db: AsyncSession, user: User, creds: Credentials) -> Credentials:
    """Refresh the access token if expired and persist the new one."""
    needs_refresh = (
        not creds.token
        or (creds.expiry is not None and creds.expiry <= datetime.utcnow() + timedelta(seconds=30))
    )
    if not needs_refresh:
        return creds

    def _refresh() -> None:
        creds.refresh(GoogleAuthRequest())

    try:
        await asyncio.to_thread(_refresh)
    except Exception as exc:
        logger.error(f"Google token refresh failed for user {user.id}: {exc}")
        raise

    user.google_access_token = creds.token
    user.google_token_expiry = creds.expiry
    await db.commit()
    return creds


# ── Calendar event creation ──────────────────────────────────────────────

async def create_meeting_event(
    db: AsyncSession,
    organizer: User,
    attendee_email: Optional[str],
    attendee_name: Optional[str],
    title: str,
    description: str,
    start_iso: str,
    duration_minutes: int,
) -> CalendarEventResult:
    """Insert a Calendar event with a Google Meet link.

    Two modes:
    - Personal: the user has connected their own Google account → event is
      created on their primary calendar with the other party as an attendee.
    - Platform (default): a server-wide Google account hosts the event and
      both the organizer and the attendee are added as attendees, so both
      receive the invite email automatically. No per-user OAuth is needed.
    """
    if not (is_connected(organizer) or platform_is_configured()):
        raise RuntimeError("Google Calendar is not configured on this server.")

    # Parse start time and normalize to UTC.
    try:
        start_dt = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
    except Exception as exc:
        raise ValueError(f"Invalid start time {start_iso!r}: {exc}") from exc
    if start_dt.tzinfo is None:
        start_dt = start_dt.replace(tzinfo=timezone.utc)
    end_dt = start_dt + timedelta(minutes=duration_minutes)

    use_platform = not is_connected(organizer)
    attendees: list[dict] = []

    if use_platform:
        creds = await asyncio.to_thread(_platform_credentials)
        organizer_email_out = settings.google_calendar_email or ""
        # Add BOTH parties as attendees of the platform-hosted event.
        if organizer.email:
            attendees.append(
                {"email": organizer.email, "displayName": organizer.full_name}
            )
        if attendee_email and attendee_email.lower() != (organizer.email or "").lower():
            entry: dict = {"email": attendee_email}
            if attendee_name:
                entry["displayName"] = attendee_name
            attendees.append(entry)
    else:
        creds = await _refresh_if_needed(db, organizer, _credentials_for(organizer))
        organizer_email_out = organizer.google_email or ""
        if attendee_email:
            entry = {"email": attendee_email}
            if attendee_name:
                entry["displayName"] = attendee_name
            attendees.append(entry)

    body: dict = {
        "summary": title,
        "description": description,
        "start": {"dateTime": start_dt.isoformat(), "timeZone": "UTC"},
        "end": {"dateTime": end_dt.isoformat(), "timeZone": "UTC"},
        "attendees": attendees,
        "conferenceData": {
            "createRequest": {
                "requestId": f"medisense-{uuid.uuid4().hex}",
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }
        },
        "reminders": {
            "useDefault": False,
            "overrides": [
                {"method": "email", "minutes": 60},
                {"method": "popup", "minutes": 10},
            ],
        },
    }

    def _insert() -> dict:
        service = build("calendar", "v3", credentials=creds, cache_discovery=False)
        return (
            service.events()
            .insert(
                calendarId="primary",
                body=body,
                sendUpdates="all",        # email all attendees
                conferenceDataVersion=1,  # required for Meet link generation
            )
            .execute()
        )

    try:
        event = await asyncio.to_thread(_insert)
    except HttpError as exc:
        logger.error(f"Google Calendar insert failed: {exc}")
        raise

    meet_link: Optional[str] = None
    conf = event.get("conferenceData") or {}
    for entry in conf.get("entryPoints") or []:
        if entry.get("entryPointType") == "video" and entry.get("uri"):
            meet_link = entry["uri"]
            break
    meet_link = meet_link or event.get("hangoutLink")

    return CalendarEventResult(
        event_id=event.get("id", ""),
        html_link=event.get("htmlLink", ""),
        meet_link=meet_link,
        organizer_email=organizer_email_out,
    )


# ── Misc ─────────────────────────────────────────────────────────────────

def new_state_token() -> str:
    """A short opaque token to bind the OAuth start to a specific user."""
    return secrets.token_urlsafe(24)
