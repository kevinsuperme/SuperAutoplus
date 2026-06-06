from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from application.pix_gpt_plus import PixGptPlusService


router = APIRouter(prefix="/pix-gpt-plus", tags=["pix-gpt-plus"])
service = PixGptPlusService()


class PixGptPlusGenerateRequest(BaseModel):
    chatgpt_account_ids: list[int] = Field(default_factory=list)
    promo_id: str = "plus-1-month-free"
    api_mode: str = "short"
    concurrency: int = 1


@router.post("/generate")
def generate_pix(body: PixGptPlusGenerateRequest):
    try:
        return service.generate(body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
