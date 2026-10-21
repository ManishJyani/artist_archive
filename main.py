import os
import secrets
from datetime import datetime, timedelta, timezone
from supabase import create_client


import bcrypt
import psycopg
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from pydantic import BaseModel, Field


import truststore
truststore.inject_into_ssl()

load_dotenv()
DATABASE_URL = os.environ["DATABASE_URL"]
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "true") == "true"
supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
BUCKET = "artworks"

app = FastAPI()


@app.get("/")
def home():
    return {"message": "Artist Diary is live"}


@app.get("/health/db")
def health_db():
    with psycopg.connect(DATABASE_URL, connect_timeout=5) as conn:
        conn.execute("SELECT 1")
    return {"database": "ok"}

@app.get("/health/storage")
def health_storage():
    supabase.storage.from_(BUCKET).list()
    return {"storage": "ok"}


class SignupRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=72)


@app.post("/auth/signup", status_code=201)
def signup(body: SignupRequest):
    email = body.email.strip().lower()
    password_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()

    try:
        with psycopg.connect(DATABASE_URL) as conn:
            row = conn.execute(
                "INSERT INTO users (email, password_hash) VALUES (%s, %s) RETURNING id, email",
                (email, password_hash),
            ).fetchone()
    except psycopg.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail="Email already registered")

    return {"id": row[0], "email": row[1]}

class LoginRequest(BaseModel):
    email: str
    password: str


@app.post("/auth/login")
def login(body: LoginRequest, response: Response):
    email = body.email.strip().lower()
    with psycopg.connect(DATABASE_URL) as conn:
        row = conn.execute(
            "SELECT id, password_hash FROM users WHERE email = %s", (email,)
        ).fetchone()
        if not row or not bcrypt.checkpw(body.password.encode(), row[1].encode()):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        token = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc) + timedelta(days=7)
        conn.execute(
            "INSERT INTO sessions (token, user_id, expires_at) VALUES (%s, %s, %s)",
            (token, row[0], expires),
        )

    response.set_cookie("session", token, httponly=True, secure=COOKIE_SECURE,
                        samesite="lax", max_age=7 * 24 * 3600)
    return {"message": "Logged in"}


def get_current_user(request: Request) -> int:
    token = request.cookies.get("session")
    if not token:
        raise HTTPException(status_code=401, detail="Not logged in")
    with psycopg.connect(DATABASE_URL) as conn:
        row = conn.execute(
            "SELECT user_id FROM sessions WHERE token = %s AND expires_at > now()", (token,)
        ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Session expired")
    return row[0]


@app.post("/auth/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get("session")
    if token:
        with psycopg.connect(DATABASE_URL) as conn:
            conn.execute("DELETE FROM sessions WHERE token = %s", (token,))
    response.delete_cookie("session")
    return {"message": "Logged out"}


@app.get("/auth/me")
def me(user_id: int = Depends(get_current_user)):
    with psycopg.connect(DATABASE_URL) as conn:
        row = conn.execute("SELECT email FROM users WHERE id = %s", (user_id,)).fetchone()
    return {"id": user_id, "email": row[0]}