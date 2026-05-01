from typing import Dict
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from datetime import datetime

from app.backend.core.database import session as db_session_maker
from app.backend.core.security import security
from app.backend.models.message import Message
from app.backend.core.config import settings

router = APIRouter(prefix="/ws", tags=["websocket"])


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, WebSocket] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        await self.broadcast({"type": "online", "user_id": user_id})

    async def disconnect(self, user_id: int):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
            await self.broadcast({"type": "offline", "user_id": user_id})

    async def send_personal_message(self, user_id: int, data: dict):
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].send_json(data)
            except Exception:
                pass

    async def broadcast(self, data: dict):
        for connection in list(self.active_connections.values()):
            try:
                await connection.send_json(data)
            except Exception:
                pass


manager = ConnectionManager()


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

                async with db_session_maker() as db:
                    message = Message(
                        sender_id=user_id,
                        receiver_id=receiver_id,
                        content=data["content"],
                        created_at=datetime.utcnow()
                    )
                    db.add(message)
                    await db.commit()
                    await db.refresh(message)

                    msg_data = {
                        "type": "new_message",
                        "message": {
                            "id": message.id,
                            "sender_id": message.sender_id,
                            "receiver_id": message.receiver_id,
                            "content": message.content,
                            "created_at": message.created_at.isoformat()
                        }
                    }
                    # Отправляем получателю
                    await manager.send_personal_message(receiver_id, msg_data)
                    await manager.send_personal_message(user_id, msg_data)

            elif data["type"] == "typing":
                await manager.send_personal_message(int(data["receiver_id"]), {
                    "type": "typing",
                    "sender_id": user_id
                })

    except WebSocketDisconnect:
        await manager.disconnect(user_id)
    except Exception as e:
        print(f"WS Error: {e}")
        await manager.disconnect(user_id)


@router.get("/online_users")
async def get_online_users():
    return list(manager.active_connections.keys())
