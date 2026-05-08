"""
auth.py — Registration, login, and current-user endpoints.

POST /auth/register  → create a doctor or patient account
POST /auth/login     → email+password+role login, returns JWT
GET  /auth/me        → current user info from bearer token
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import User, get_db
from models.auth_models import (
    AuthResponse,
    LoginRequest,
    RegisterRequest,
    UpdateSpecialtyRequest,
    UserPublic,
    ProfileUpdateRequest,
)
from services.auth_service import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
    decode_token,
)
from services.specialties import SPECIALTIES, SPECIALTY_IDS
from utils.helpers import generate_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


def _to_public(user: User) -> UserPublic:
    return UserPublic(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,  # type: ignore[arg-type]
        created_at=user.created_at,
        specialty=user.specialty,
        phone_number=user.phone_number,
        bio=user.bio,
        date_of_birth=user.date_of_birth,
        gender=user.gender,
        blood_group=user.blood_group,
        address=user.address,
        emergency_contact_name=user.emergency_contact_name,
        emergency_contact_phone=user.emergency_contact_phone,
        has_profile_pic=user.profile_pic_data is not None,
    )


@router.post("/register", response_model=AuthResponse)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    email = body.email.lower().strip()

    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    specialty: str | None = None
    if body.role == "doctor":
        # Specialization is mandatory for doctors — patients pick doctors by
        # specialty when starting a chat.
        if not body.specialty:
            raise HTTPException(
                status_code=400,
                detail="Please choose your specialization.",
            )
        if body.specialty not in SPECIALTY_IDS:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown specialty: {body.specialty}.",
            )
        specialty = body.specialty

    user = User(
        id=generate_id(),
        email=email,
        password_hash=hash_password(body.password),
        full_name=body.full_name.strip(),
        role=body.role,
        specialty=specialty,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id, user.role, user.email)
    logger.info(f"Registered {user.role}: {user.email}")
    return AuthResponse(access_token=token, user=_to_public(user))


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    email = body.email.lower().strip()

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if user.role != body.role:
        raise HTTPException(
            status_code=403,
            detail=f"This account is registered as {user.role}, not {body.role}.",
        )

    token = create_access_token(user.id, user.role, user.email)
    return AuthResponse(access_token=token, user=_to_public(user))


@router.get("/me", response_model=UserPublic)
async def me(user: User = Depends(get_current_user)):
    return _to_public(user)


@router.get("/me/profile-pic")
async def get_profile_pic(token: str = Query(...), db: AsyncSession = Depends(get_db)):
    """Return the raw profile picture bytes with correct MIME type."""
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.profile_pic_data:
        raise HTTPException(status_code=404, detail="No profile picture set")
    return Response(content=user.profile_pic_data, media_type=user.profile_pic_mime or "image/jpeg")


@router.put("/me/profile", response_model=UserPublic)
async def update_profile(
    body: ProfileUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update personal profile fields (name, phone, bio, DOB, gender)."""
    if body.full_name is not None:
        user.full_name = body.full_name
    if body.phone_number is not None:
        user.phone_number = body.phone_number
    if body.bio is not None:
        user.bio = body.bio
    if body.date_of_birth is not None:
        user.date_of_birth = body.date_of_birth
    if body.gender is not None:
        user.gender = body.gender
    if body.blood_group is not None:
        user.blood_group = body.blood_group
    if body.address is not None:
        user.address = body.address
    if body.emergency_contact_name is not None:
        user.emergency_contact_name = body.emergency_contact_name
    if body.emergency_contact_phone is not None:
        user.emergency_contact_phone = body.emergency_contact_phone

    await db.commit()
    await db.refresh(user)
    return _to_public(user)


@router.put("/me/profile-pic", response_model=UserPublic)
async def update_profile_pic(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload a new profile picture. Replaces existing one."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    # Read the bytes (limit to 2MB for in-db storage safety)
    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be under 2MB")

    user.profile_pic_data = content
    user.profile_pic_mime = file.content_type

    await db.commit()
    await db.refresh(user)
    return _to_public(user)


@router.get("/specialties")
async def list_public_specialties():
    """Public list of specialties — used by the doctor registration form
    before any token exists."""
    return {
        "specialties": [
            {"id": s["id"], "name": s["name"], "description": s["description"]}
            for s in SPECIALTIES
        ]
    }


@router.put("/me/specialty", response_model=UserPublic)
async def update_specialty(
    body: UpdateSpecialtyRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Set the calling doctor's specialty. Only doctors may set this."""
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors have a specialty.")
    if body.specialty not in SPECIALTY_IDS:
        raise HTTPException(status_code=400, detail=f"Unknown specialty: {body.specialty}.")
    user.specialty = body.specialty
    await db.commit()
    await db.refresh(user)
    return _to_public(user)
