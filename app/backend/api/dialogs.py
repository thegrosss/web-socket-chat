from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload

from app.backend.core.database import get_session
from app.backend.core.security import security
from app.backend.models.message import Message
from app.backend.repository.user import Repository as UserRepository

router = APIRouter(prefix="/dialogs", tags=["dialogs"])


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
        .options(selectinload(Message.sender), selectinload(Message.receiver))
        # 🔥 Сортируем строго по ID (старые первые, новые в конце)
        .order_by(Message.id.asc())
    )
    messages = result.scalars().all()

    dialogs = {}
    for m in messages:
        # Определяем собеседника
        other_user = m.receiver if m.sender_id == user_id else m.sender

        # Так как идем от старых к новым, последнее сообщение гарантированно ПЕРЕЗАПИШЕТ старые
        dialogs[other_user.id] = {
            "user": other_user,
            "last_msg": m.content,
            "msg_id": m.id  # Сохраняем ID сообщения для сортировки списка
        }

    # 🔥 Сортируем сами чаты так, чтобы сверху был тот, у которого ID сообщения больше
    sorted_dialogs = sorted(dialogs.values(), key=lambda x: x["msg_id"], reverse=True)

    return [
        {
            "user_id": d["user"].id,
            "first_name": d["user"].first_name,
            "last_name": d["user"].last_name,
            "last_message": d["last_msg"]
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
        .order_by(Message.created_at.desc())
        .offset(offset)
    )
    messages = result.scalars().all()
    return {
        "user": {
            "id": other_user.id,
            "first_name": other_user.first_name,
            "last_name": other_user.last_name
        },
        "messages": [
            {
                "id": msg.id,
                "sender_id": msg.sender_id,
                "content": msg.content,
                "created_at": msg.created_at,
                "is_read": msg.is_read
            }
            for msg in sorted(messages, key=lambda x: x.created_at)
        ]
    }
