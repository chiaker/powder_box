from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthTokens(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutResponse(BaseModel):
    success: bool = True


class ConfirmRequest(BaseModel):
    token: str


class AuthMe(BaseModel):
    email: EmailStr
    email_confirmed: bool


class SuccessResponse(BaseModel):
    success: bool = True


class InternalEmailsRequest(BaseModel):
    ids: list[int]
