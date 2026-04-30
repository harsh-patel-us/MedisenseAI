"""
setup_google_calendar.py — One-shot helper to obtain the platform Google
account's refresh token. Run this ONCE on the machine that hosts the
MediSense backend.

Usage
-----
    cd backend
    python scripts/setup_google_calendar.py

What it does
------------
1. Reads GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET from your .env (via the
   shared `config.settings`).
2. Spins up a tiny local OAuth callback server on http://localhost:8765/
   and opens your browser.
3. After you sign in with the Google account that should host all
   MediSense consultation events (e.g. medisense@yourclinic.com), Google
   redirects back with an authorization code.
4. Prints the resulting `GOOGLE_REFRESH_TOKEN` and `GOOGLE_CALENDAR_EMAIL`
   so you can paste them into your .env. Once both are set, every meeting
   scheduled through the app creates a real Google Calendar event with a
   Meet link, and emails the invite to both the doctor and the patient.

Note: you must add `http://localhost:8765/` to "Authorized redirect URIs"
on the OAuth client in the Google Cloud console for this script to work.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Allow running this file as `python scripts/setup_google_calendar.py`
# from the /backend directory.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from google_auth_oauthlib.flow import InstalledAppFlow  # noqa: E402
from googleapiclient.discovery import build  # noqa: E402

from config import settings  # noqa: E402
from services.google_calendar import GOOGLE_SCOPES  # noqa: E402

LOCAL_REDIRECT_PORT = 8765


def main() -> int:
    if not settings.google_client_id or not settings.google_client_secret:
        print("ERROR: Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env first.")
        return 2

    client_config = {
        "installed": {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [f"http://localhost:{LOCAL_REDIRECT_PORT}/"],
        }
    }

    flow = InstalledAppFlow.from_client_config(client_config, scopes=GOOGLE_SCOPES)
    print(
        "\nOpening your browser to authorise the platform Google account…\n"
        f"(Make sure http://localhost:{LOCAL_REDIRECT_PORT}/ is on your OAuth client's\n"
        "  authorized redirect URIs in Google Cloud → APIs & Services → Credentials.)\n"
    )
    creds = flow.run_local_server(
        port=LOCAL_REDIRECT_PORT,
        prompt="consent",
        access_type="offline",
        open_browser=True,
    )

    if not creds.refresh_token:
        print(
            "ERROR: Google did not return a refresh token. This usually means the\n"
            "       account has previously authorised the same client without\n"
            "       prompt=consent. Revoke MediSense's access at\n"
            "       https://myaccount.google.com/permissions and re-run this script."
        )
        return 1

    # Best-effort look-up of the connected email so the operator knows which
    # account they just authorised.
    email = ""
    try:
        service = build("oauth2", "v2", credentials=creds, cache_discovery=False)
        email = service.userinfo().get().execute().get("email", "") or ""
    except Exception as exc:  # pragma: no cover — informational only
        print(f"(Could not read userinfo email: {exc})")

    bar = "─" * 70
    print()
    print(bar)
    print("✅  Add these two lines to backend/.env, then restart the backend:")
    print(bar)
    print(f'GOOGLE_REFRESH_TOKEN="{creds.refresh_token}"')
    if email:
        print(f'GOOGLE_CALENDAR_EMAIL="{email}"')
    else:
        print('GOOGLE_CALENDAR_EMAIL=""  # optional: paste the email you just signed in with')
    print(bar)
    print()
    print(
        "Every consultation scheduled in MediSense will now create a Google\n"
        "Calendar event on this account with a Meet link, and email both the\n"
        "doctor and the patient with the invite."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
