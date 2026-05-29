from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    secret_key: str
    access_token_expire_minutes: int = 480

    # development | staging | production
    environment: str = "production"

    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
