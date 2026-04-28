from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DB_NAME: str
    SECRET_KEY: str
    ACCESS_COOKIE_NAME: str

    model_config = SettingsConfigDict(env_file=".env")

settings = Settings()