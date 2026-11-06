"""Dependencias HTTP: identidad del pagador (P-3) y encabezados de correlación."""
from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from typing import Annotated

from fastapi import Header, HTTPException, Request, status

PAYER_HEADER = "X-Payer-Id"
MERCHANT_HEADER = "X-Merchant-Id"
SAFE_HEADER_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{1,64}$")


@dataclass(frozen=True)
class RequestContext:
    payer_id: str
    request_id: str
    correlation_id: str


def _generated_or_valid(value: str | None) -> str:
    if value is None:
        return uuid.uuid4().hex
    if not SAFE_HEADER_PATTERN.fullmatch(value):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="encabezado inválido")
    return value


def request_context(
    x_payer_id: Annotated[str | None, Header()] = None,
    x_request_id: Annotated[str | None, Header()] = None,
    x_correlation_id: Annotated[str | None, Header()] = None,
) -> RequestContext:
    # Solo MVP: el pagador viene de X-Payer-Id hasta contar con auth/ (decisión P-3).
    if x_payer_id is None or not SAFE_HEADER_PATTERN.fullmatch(x_payer_id):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="identidad requerida")
    return RequestContext(payer_id=x_payer_id, request_id=_generated_or_valid(x_request_id),
                          correlation_id=_generated_or_valid(x_correlation_id))


def services_of(request: Request):
    return request.app.state.services


def merchant_id_of(x_merchant_id: Annotated[str | None, Header()] = None) -> str:
    # Solo MVP: el comercio viene de X-Merchant-Id hasta contar con auth/ (mismo patrón provisional que P-3).
    if x_merchant_id is None or not SAFE_HEADER_PATTERN.fullmatch(x_merchant_id):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="identidad de comercio requerida")
    return x_merchant_id
