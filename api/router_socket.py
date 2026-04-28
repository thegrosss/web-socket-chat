from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, Dict[int, WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: int, room_id: int):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = {}
        self.active_connections[room_id][user_id] = websocket

    def disconnect(self, user_id: int, room_id: int):
        if room_id in self.active_connections and user_id in self.active_connections[room_id]:
            del self.active_connections[room_id][user_id]
            if not self.active_connections[room_id]:
                del self.active_connections[room_id]

    async def broadcast(self, message: str, room_id: int, sender_id: int):
        if room_id in self.active_connections:
            for user_id, connection in self.active_connections[room_id].items():
                message_with_class = {
                    "message": message,
                    "is_self": user_id == sender_id
                }
                await connection.send_json(message_with_class)

connectionManager = ConnectionManager()
router = APIRouter(prefix="/chat")

@router.websocket("/{room_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: int, user_id: int, username: str):
    await connectionManager.connect(websocket, user_id, room_id)
    await connectionManager.broadcast(f"{username} присоединился к чату", room_id, user_id)
    try:
        while True:
            data = await websocket.receive_text()
            await connectionManager.broadcast(f"{username}: {data}", room_id, user_id)
    except WebSocketDisconnect:
        connectionManager.disconnect(user_id, room_id)
        await connectionManager.broadcast(f"{username} покинул чат", room_id, user_id)