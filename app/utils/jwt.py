from jose import jwt, JWTError
from datetime import datetime, timedelta

SECRET_KEY = "super-secret"  # change for prod
ALGORITHM = "HS256"
EXPIRE_MINUTES = 60 * 24  # 1 day

def create_token(player_id: str, name: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=EXPIRE_MINUTES)
    payload = {
        "sub": player_id,
        "name": name,
        "exp": expire
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload  # contains player_id in "sub"
    except JWTError:
        return None