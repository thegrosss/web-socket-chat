from app.core.config import settings
from authx import AuthX, AuthXConfig
from passlib.context import CryptContext

auth_config = AuthXConfig()
auth_config.JWT_SECRET_KEY = settings.SECRET_KEY
auth_config.JWT_TOKEN_LOCATION = ["cookies"]
auth_config.JWT_ACCESS_COOKIE_NAME = settings.ACCESS_COOKIE_NAME

auth = AuthX(config=auth_config)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(password: str, hashed_password: str) -> bool:
    return pwd_context.verify(password, hashed_password)