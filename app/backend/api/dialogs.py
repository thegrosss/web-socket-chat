from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload

from app.backend.core.database import get_session
from app.backend.core.security import security
from app.backend.models.message import Message
from app.backend.repository.user import Repository as UserRepository

router = APIRouter(prefix="/dialogs", tags=["dialogs"])


def serialize_attachment(attachment) -> dict:
    return {
        "id": attachment.id,
        "url": attachment.file_url,
        "name": attachment.file_name,
        "type": attachment.file_type,
        "content_type": attachment.mime_type,
        "size": attachment.file_size,
    }


def message_preview(message: Message) -> str:
    if message.content:
        return message.content
    if any(attachment.file_type == "image" for attachment in message.attachments):
        return "Фото"
    if any(attachment.file_type == "video" for attachment in message.attachments):
        return "Видео"
    if message.attachments:
        return "Файл"
    return ""


@router.get("/")
async def get_dialogs(
        user_id: int = Depends(security.get_current_user),
        session: AsyncSession = Depends(get_session)
):
    result = await session.execute(
        select(Message)
        .where(
            or_(
                Message.sender_id == user_id,
                Message.receiver_id == user_id
            )
        )
        .options(selectinload(Message.sender), selectinload(Message.receiver), selectinload(Message.attachments))
        .order_by(Message.id.asc())
    )
    messages = result.scalars().all()

    dialogs = {}
    for m in messages:
        other_user = m.receiver if m.sender_id == user_id else m.sender

        dialogs[other_user.id] = {
            "user": other_user,
            "last_msg": message_preview(m),
            "last_msg_created_at": m.created_at,
            "msg_id": m.id
        }

    sorted_dialogs = sorted(dialogs.values(), key=lambda x: x["msg_id"], reverse=True)

    return [
        {
            "user_id": d["user"].id,
            "first_name": d["user"].first_name,
            "last_name": d["user"].last_name,
            "username": d["user"].username,
            "avatar_url": d["user"].avatar_url,
            "last_message": d["last_msg"],
            "last_message_created_at": d["last_msg_created_at"].isoformat() if d["last_msg_created_at"] else None,
        }
        for d in sorted_dialogs
    ]


@router.get("/{other_user_id}/messages")
async def get_messages(
        other_user_id: int,
        offset: int = 0,
        user_id: int = Depends(security.get_current_user),
        session: AsyncSession = Depends(get_session)
):
    other_user = await UserRepository.find_user(session, id=other_user_id)
    if not other_user:
        raise HTTPException(status_code=404, detail="User not found")
    result = await session.execute(
        select(Message)
        .where(
            or_(
                and_(Message.sender_id == user_id, Message.receiver_id == other_user_id),
                and_(Message.sender_id == other_user_id, Message.receiver_id == user_id)
            )
        )
        .options(selectinload(Message.attachments))
        .order_by(Message.created_at.desc())
        .offset(offset)
    )
    messages = result.scalars().all()
    return {
        "user": {
            "id": other_user.id,
            "first_name": other_user.first_name,
            "last_name": other_user.last_name,
            "username": other_user.username,
            "avatar_url": other_user.avatar_url,
        },
        "messages": [
            {
                "id": msg.id,
                "sender_id": msg.sender_id,
                "content": msg.content,
                "created_at": msg.created_at,
                "is_read": msg.is_read,
                "attachments": [serialize_attachment(attachment) for attachment in msg.attachments],
            }
            for msg in sorted(messages, key=lambda x: x.created_at)
        ]
    }
