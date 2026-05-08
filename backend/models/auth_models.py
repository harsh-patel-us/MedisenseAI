"""
auth_models.py — Pydantic schemas for registration, login, and auth responses.
"""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

Role = Literal["doctor", "patient"]


class RegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    role: Role
    # Required for doctors — id from services.specialties (e.g. "cardiologist").
    # Ignored for patients.
    specialty: str | None = Field(default=None, max_length=80)
    # Patient UI language preference. Validated against SUPPORTED_LANGUAGES on
    # the server; invalid codes silently default to "en".
    preferred_language: str | None = Field(default="en", max_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    role: Role


class UserPublic(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    role: Role
    created_at: datetime
    # Doctors only — id of their medical specialty (one of services.specialties).
    specialty: str | None = None
    
    # Profile fields
    phone_number: str | None = None
    bio: str | None = None
    date_of_birth: datetime | None = None
    gender: str | None = None
    blood_group: str | None = None
    address: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    has_profile_pic: bool = False
    # Patient UI language. Always "en" for doctors.
    preferred_language: str = "en"


class UpdateLanguageRequest(BaseModel):
    """Body for PATCH /auth/language."""
    language_code: str = Field(..., min_length=2, max_length=8)


class ProfileUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    phone_number: str | None = Field(default=None, max_length=20, pattern=r"^\+?[0-9\s\-()]*$")
    bio: str | None = Field(default=None, max_length=1000)
    date_of_birth: datetime | None = None
    gender: str | None = None
    blood_group: str | None = Field(default=None, max_length=10)
    address: str | None = Field(default=None, max_length=500)
    emergency_contact_name: str | None = Field(default=None, max_length=120)
    emergency_contact_phone: str | None = Field(default=None, max_length=20, pattern=r"^\+?[0-9\s\-()]*$")


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class UpdateSpecialtyRequest(BaseModel):
    specialty: str = Field(..., min_length=1, max_length=80)
