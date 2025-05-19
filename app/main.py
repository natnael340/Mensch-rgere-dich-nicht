from fastapi import FastAPI
from app.api import router

app = FastAPI(title="Mensch ärgere Dich nicht", version="0.1.0")

app.include_router(router)