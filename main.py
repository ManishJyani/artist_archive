from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def home():
    return {"message": "Artist Diary is live"}