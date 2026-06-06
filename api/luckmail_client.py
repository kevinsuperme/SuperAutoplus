from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from application.luckmail_client import LuckMailClientCodeService


router = APIRouter(prefix="/luckmail", tags=["luckmail-client"])
service = LuckMailClientCodeService()


class LuckMailClientCodeRequest(BaseModel):
    ticket: str = ""


@router.post("/client/code")
def get_luckmail_client_code(body: LuckMailClientCodeRequest):
    return service.get_code(body.model_dump())
