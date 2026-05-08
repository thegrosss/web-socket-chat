from datetime import date

from sqlalchemy import Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.backend.core.database import Base
from app.backend.models.message import Message

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(nullable=False)
    first_name: Mapped[str] = mapped_column(default="", nullable=False)
    last_name: Mapped[str] = mapped_column(default="", nullable=False)
    username: Mapped[str | None] = mapped_column(unique=True, nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(nullable=True)
    birth_date: Mapped[date | None] = mapped_column(nullable=True)

    sent_messages = relationship("Message", foreign_keys=[Message.sender_id], back_populates="sender")
    received_messages = relationship("Message", foreign_keys=[Message.receiver_id], back_populates="receiver")
