from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import router

app = FastAPI(title="Mensch ärgere Dich nicht", version="0.1.0")

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,      # your React app origin
    allow_credentials=True,
    allow_methods=["*"],        # GET, POST, OPTIONS, PUT, DELETE…
    allow_headers=["*"],        # Content-Type, Authorization…
)

app.include_router(router)