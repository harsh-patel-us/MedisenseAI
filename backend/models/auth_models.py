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


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic
