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


import uuid
from fastapi import File, Form, UploadFile
from typing import Optional,List



from pathlib import Path
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

load_dotenv()
DATABASE_URL = os.environ["DATABASE_URL"]
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "true") == "true"
supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
BUCKET = "artworks"

app = FastAPI()
BASE_DIR = Path(__file__).resolve().parent
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


@app.get("/")
def home():
    return FileResponse(BASE_DIR / "static" / "index.html")


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




MAX_BYTES = 10 * 1024 * 1024  # 10 MB


def detect_image(data: bytes):
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", "jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", "webp"
    return None, None


@app.post("/entries", status_code=201)
def create_entry(
    image: UploadFile = File(...),
    title: str = Form("", max_length=200),
    description: str = Form(""),
    tags: str = Form(""),  # comma-separated, e.g. "sketch, watercolor"
    user_id: int = Depends(get_current_user),
):
    data = image.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image must be 10 MB or smaller")

    mime, ext = detect_image(data)
    if not mime:
        raise HTTPException(status_code=415, detail="Only JPEG, PNG or WebP allowed")

    tag_names = sorted({t.strip().lower() for t in tags.split(",") if t.strip()})
    path = f"users/{user_id}/{uuid.uuid4().hex}.{ext}"

    supabase.storage.from_(BUCKET).upload(path, data, {"content-type": mime})

    try:
        with psycopg.connect(DATABASE_URL) as conn:
            entry_id = conn.execute(
                """INSERT INTO entries (user_id, title, description, image_path,
                                        original_filename, mime_type, size_bytes)
                   VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                (user_id, title, description, path, image.filename, mime, len(data)),
            ).fetchone()[0]

            for name in tag_names:
                tag_id = conn.execute(
                    """INSERT INTO tags (user_id, name) VALUES (%s, %s)
                       ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
                       RETURNING id""",
                    (user_id, name),
                ).fetchone()[0]
                conn.execute(
                    "INSERT INTO entry_tags (entry_id, tag_id) VALUES (%s, %s)",
                    (entry_id, tag_id),
                )
    except Exception:
        supabase.storage.from_(BUCKET).remove([path])  # don't leave an orphan file
        raise

    return {"id": entry_id, "image_path": path, "tags": tag_names}


ENTRY_SQL = """
SELECT e.id, e.title, e.description, e.image_path, e.created_at,
       COALESCE(array_agg(t.name ORDER BY t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags
FROM entries e
LEFT JOIN entry_tags et ON et.entry_id = e.id
LEFT JOIN tags t ON t.id = et.tag_id
"""


def signed_url(path: str) -> str:
    res = supabase.storage.from_(BUCKET).create_signed_url(path, 3600)
    return res.get("signedURL") or res.get("signedUrl")


def to_dict(row):
    return {
        "id": row[0], "title": row[1], "description": row[2],
        "image_url": signed_url(row[3]), "created_at": row[4], "tags": row[5],
    }


@app.get("/entries")
def list_entries(
    tag: Optional[str] = None,
    q: Optional[str] = None,
    user_id: int = Depends(get_current_user),
):
    tag = tag.strip().lower() if tag else None
    q = q.strip()[:100] if q and q.strip() else None
    # Escape % and _ so the user's text is matched literally
    pattern = None
    if q:
        pattern = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"

    with psycopg.connect(DATABASE_URL) as conn:
        rows = conn.execute(
            ENTRY_SQL + """
            WHERE e.user_id = %s
              AND (%s::text IS NULL OR EXISTS (
                    SELECT 1 FROM entry_tags et2 JOIN tags t2 ON t2.id = et2.tag_id
                    WHERE et2.entry_id = e.id AND t2.name = %s))
              AND (%s::text IS NULL
                   OR e.title ILIKE %s
                   OR EXISTS (
                     SELECT 1 FROM entry_tags et3 JOIN tags t3 ON t3.id = et3.tag_id
                     WHERE et3.entry_id = e.id AND t3.name ILIKE %s))
            GROUP BY e.id
            ORDER BY e.created_at DESC
            LIMIT 50""",
            (user_id, tag, tag, pattern, pattern, pattern),
        ).fetchall()
    return [to_dict(r) for r in rows]


@app.get("/entries/{entry_id}")
def get_entry(entry_id: int, user_id: int = Depends(get_current_user)):
    with psycopg.connect(DATABASE_URL) as conn:
        row = conn.execute(
            ENTRY_SQL + " WHERE e.id = %s AND e.user_id = %s GROUP BY e.id",
            (entry_id, user_id),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Entry not found")
    return to_dict(row)

class EntryUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    tags: Optional[List[str]] = None


DELETE_UNUSED_TAGS = """
DELETE FROM tags t WHERE t.user_id = %s
AND NOT EXISTS (SELECT 1 FROM entry_tags et WHERE et.tag_id = t.id)
"""


@app.patch("/entries/{entry_id}")
def update_entry(entry_id: int, body: EntryUpdate, user_id: int = Depends(get_current_user)):
    fields = body.model_dump(exclude_unset=True)  # only the fields the user actually sent

    with psycopg.connect(DATABASE_URL) as conn:
        owned = conn.execute(
            "SELECT 1 FROM entries WHERE id = %s AND user_id = %s FOR UPDATE",
            (entry_id, user_id),
        ).fetchone()
        if not owned:
            raise HTTPException(status_code=404, detail="Entry not found")

        # Column names come from this fixed list, never from user input
        sets, params = ["updated_at = now()"], []
        for col in ("title", "description"):
            if col in fields:
                sets.append(f"{col} = %s")
                params.append(fields[col] or "")
        conn.execute(f"UPDATE entries SET {', '.join(sets)} WHERE id = %s", (*params, entry_id))

        if "tags" in fields:
            conn.execute("DELETE FROM entry_tags WHERE entry_id = %s", (entry_id,))
            names = sorted({t.strip().lower() for t in (fields["tags"] or []) if t.strip()})
            for name in names:
                tag_id = conn.execute(
                    """INSERT INTO tags (user_id, name) VALUES (%s, %s)
                       ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
                       RETURNING id""",
                    (user_id, name),
                ).fetchone()[0]
                conn.execute(
                    "INSERT INTO entry_tags (entry_id, tag_id) VALUES (%s, %s)", (entry_id, tag_id)
                )
            conn.execute(DELETE_UNUSED_TAGS, (user_id,))

        row = conn.execute(ENTRY_SQL + " WHERE e.id = %s GROUP BY e.id", (entry_id,)).fetchone()
    return to_dict(row)


@app.delete("/entries/{entry_id}", status_code=204)
def delete_entry(entry_id: int, user_id: int = Depends(get_current_user)):
    with psycopg.connect(DATABASE_URL) as conn:
        row = conn.execute(
            "DELETE FROM entries WHERE id = %s AND user_id = %s RETURNING image_path",
            (entry_id, user_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Entry not found")
        conn.execute(DELETE_UNUSED_TAGS, (user_id,))

    supabase.storage.from_(BUCKET).remove([row[0]])  # remove the image file too
    return Response(status_code=204)


@app.get("/entries/{entry_id}/download")
def download_entry(entry_id: int, user_id: int = Depends(get_current_user)):
    with psycopg.connect(DATABASE_URL) as conn:
        row = conn.execute(
            "SELECT image_path FROM entries WHERE id = %s AND user_id = %s",
            (entry_id, user_id),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Entry not found")
    # Short-lived link that tells the browser to save the file instead of opening it
    res = supabase.storage.from_(BUCKET).create_signed_url(row[0], 60, {"download": True})
    return RedirectResponse(res.get("signedURL") or res.get("signedUrl"))