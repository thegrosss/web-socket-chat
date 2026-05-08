import re
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status


UPLOAD_ROOT = Path("app/frontend/uploads")
MAX_UPLOAD_SIZE = 1024 * 1024 * 1024
IMAGE_EXTENSIONS = {".avif", ".gif", ".jpg", ".jpeg", ".png", ".webp"}
VIDEO_EXTENSIONS = {".avi", ".m4v", ".mov", ".mp4", ".mpeg", ".mpg", ".webm"}


def ensure_upload_dirs() -> None:
    (UPLOAD_ROOT / "files").mkdir(parents=True, exist_ok=True)
    (UPLOAD_ROOT / "avatars").mkdir(parents=True, exist_ok=True)


def clean_filename(filename: str | None) -> str:
    original = Path(filename or "file").name
    cleaned = re.sub(r"[^A-Za-z0-9._ -]+", "_", original).strip(" .")
    return cleaned or "file"


def public_upload_url(folder: str, filename: str) -> str:
    return f"/media/{folder}/{filename}"


def detect_upload_type(mime_type: str, filename: str) -> str:
    extension = Path(filename).suffix.lower()
    if mime_type.startswith("image/") or extension in IMAGE_EXTENSIONS:
        return "image"
    if mime_type.startswith("video/") or extension in VIDEO_EXTENSIONS:
        return "video"
    return "file"


async def save_upload_file(file: UploadFile, folder: str, max_size: int = MAX_UPLOAD_SIZE) -> dict:
    ensure_upload_dirs()

    original_name = clean_filename(file.filename)
    extension = Path(original_name).suffix
    stored_name = f"{uuid4().hex}{extension}"
    target = UPLOAD_ROOT / folder / stored_name

    size = 0
    with target.open("wb") as buffer:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > max_size:
                buffer.close()
                target.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File is too large. Maximum size is {max_size // 1024 // 1024} MB",
                )
            buffer.write(chunk)

    mime_type = file.content_type or "application/octet-stream"
    return {
        "url": public_upload_url(folder, stored_name),
        "name": original_name,
        "content_type": mime_type,
        "type": detect_upload_type(mime_type, original_name),
        "size": size,
    }
