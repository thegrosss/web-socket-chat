from fastapi import APIRouter, Depends, File, UploadFile

from app.backend.core.security import security
from app.backend.core.uploads import save_upload_file

router = APIRouter(prefix="/uploads", tags=["uploads"])


@router.post("/messages")
async def upload_message_files(
        files: list[UploadFile] = File(...),
        user_id: int = Depends(security.get_current_user)
):
    saved_files = []
    for file in files[:10]:
        saved_files.append(await save_upload_file(file, "files"))

    return {"files": saved_files}
