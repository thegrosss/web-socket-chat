from fastapi import Request, HTTPException, status, Depends
from authx import AuthX, AuthXConfig
from passlib.context import CryptContext

from app.backend.core.config import settings

class Security:
    def __init__(self):
        auth_config = AuthXConfig()
        auth_config.JWT_SECRET_KEY = settings.SECRET_KEY
        auth_config.JWT_TOKEN_LOCATION = ["cookies"]
        auth_config.JWT_ACCESS_COOKIE_NAME = settings.ACCESS_COOKIE_NAME

        self.auth = AuthX(config=auth_config)
        self.pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


    def get_password_hash(self, password: str) -> str:
        return self.pwd_context.hash(password)

    def verify_password(self, password: str, hashed_password: str) -> bool:
        return self.pwd_context.verify(password, hashed_password)

    @staticmethod
    async def get_token_from_cookies(request: Request):
        token = request.cookies.get(settings.ACCESS_COOKIE_NAME)
        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated"
            )
        return token

    async def get_current_user(self, token: str = Depends(get_token_from_cookies)):
        try:
            payload = self.auth._decode_token(token)
            user_id = int(payload.sub)
            return user_id
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated"
            )

security = Security()