from typing import Dict, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from datetime import datetime

from app.backend.core.database import session as db_session_maker
from app.backend.core.security import security
from app.backend.models.message import Message, MessageAttachment
from app.backend.core.config import settings

router = APIRouter(prefix="/ws", tags=["websocket"])


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, Set[WebSocket]] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        is_first_connection = user_id not in self.active_connections
        self.active_connections.setdefault(user_id, set()).add(websocket)
        if not is_first_connection:
            return
        await self.broadcast({"type": "online", "user_id": user_id})

    async def disconnect(self, user_id: int, websocket: WebSocket):
        connections = self.active_connections.get(user_id)
        if not connections:
            return

        connections.discard(websocket)
        if not connections:
            del self.active_connections[user_id]
            await self.broadcast({"type": "offline", "user_id": user_id})

    async def send_personal_message(self, user_id: int, data: dict):
        connections = list(self.active_connections.get(user_id, set()))
        stale_connections = []
        for connection in connections:
            try:
                await connection.send_json(data)
            except Exception:
                stale_connections.append(connection)

        for connection in stale_connections:
            await self.disconnect(user_id, connection)

    async def broadcast(self, data: dict):
        for user_id in list(self.active_connections.keys()):
            await self.send_personal_message(user_id, data)


manager = ConnectionManager()


def serialize_attachment(attachment: MessageAttachment) -> dict:
    return {
        "id": attachment.id,
        "url": attachment.file_url,
        "name": attachment.file_name,
        "type": attachment.file_type,
        "content_type": attachment.mime_type,
        "size": attachment.file_size,
    }


def normalize_attachment_type(file_type: str) -> str:
    if file_type in {"image", "video"}:
        return file_type
    return "file"


@router.websocket("/")
async def websocket_endpoint(websocket: WebSocket):
    token = websocket.cookies.get(settings.ACCESS_COOKIE_NAME)
    if not token:
        token = websocket.query_params.get("token")

    if not token:
        await websocket.close(code=1008)
        return

    try:
        payload = security.auth._decode_token(token)
        user_id = int(payload.sub)
    except Exception:
        await websocket.close(code=1008)
        return

    await manager.connect(user_id, websocket)

    try:
        while True:
            data = await websocket.receive_json()

            if data["type"] == "message":
                receiver_id = int(data["receiver_id"])
                content = (data.get("content") or "").strip()
                attachments_data = data.get("attachments") or []
                if not isinstance(attachments_data, list):
                    attachments_data = []

                if not content and not attachments_data:
                    continue

                async with db_session_maker() as db:
                    message = Message(
                        sender_id=user_id,
                        receiver_id=receiver_id,
                        content=content,
                        created_at=datetime.utcnow()
                    )
                    db.add(message)
                    await db.flush()

                    attachments = []
                    for attachment_data in attachments_data[:10]:
                        if not isinstance(attachment_data, dict):
                            continue
                        file_url = str(attachment_data.get("url") or "")
                        file_name = str(attachment_data.get("name") or "file")
                        file_type = str(attachment_data.get("type") or "file")
                        if not file_url.startswith("/media/files/"):
                            continue
                        try:
                            file_size = int(attachment_data.get("size") or 0)
                        except (TypeError, ValueError):
                            file_size = 0

                        attachment = MessageAttachment(
                            message_id=message.id,
                            file_url=file_url,
                            file_name=file_name[:255],
                            file_type=normalize_attachment_type(file_type),
                            mime_type=attachment_data.get("content_type"),
                            file_size=file_size,
                        )
                        db.add(attachment)
                        attachments.append(attachment)

                    await db.commit()
                    await db.refresh(message)
                    for attachment in attachments:
                        await db.refresh(attachment)

                    msg_data = {
                        "type": "new_message",
                        "message": {
                            "id": message.id,
                            "sender_id": message.sender_id,
                            "receiver_id": message.receiver_id,
                            "content": message.content,
                            "created_at": message.created_at.isoformat(),
                            "attachments": [serialize_attachment(attachment) for attachment in attachments],
                        }
                    }
                    await manager.send_personal_message(receiver_id, msg_data)
                    await manager.send_personal_message(user_id, msg_data)

            elif data["type"] == "typing":
                await manager.send_personal_message(int(data["receiver_id"]), {
                    "type": "typing",
                    "sender_id": user_id
                })

    except WebSocketDisconnect:
        await manager.disconnect(user_id, websocket)
    except Exception as e:
        print(f"WS Error: {e}")
        await manager.disconnect(user_id, websocket)


@router.get("/online_users")
async def get_online_users():
    return list(manager.active_connections.keys())
