import os
import psycopg
from dotenv import load_dotenv
from fastapi import FastAPI

load_dotenv()
DATABASE_URL = os.environ["DATABASE_URL"]

app = FastAPI()

@app.get("/")
def home():
    return {"message": "Artist Diary is live"}

@app.get("/health/db")
def health_db():
    with psycopg.connect(DATABASE_URL, connect_timeout=5) as conn:
        conn.execute("SELECT 1")
    return {"database": "ok"}