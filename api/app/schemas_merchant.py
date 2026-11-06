"""Modelos HTTP del estado de pagos QR del comercio. La validación de formato y tamaños del borde vive aquí."""
from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StrictInt

SAFE_ID_PATTERN = r"^[A-Za-z0-9._:-]+$"
MAX_ID_LENGTH = 64
MAX_PROVIDER_STATUS_LENGTH = 40
MAX_QR_AMOUNT_CENTS = 100_000_000  # provisional (OQ-08): tope de cordura, no un límite de negocio aprobado

SafeId = Annotated[str, Field(min_length=1, max_length=MAX_ID_LENGTH, pattern=SAFE_ID_PATTERN)]
ProviderStatus = Annotated[str, Field(min_length=1, max_length=MAX_PROVIDER_STATUS_LENGTH, pattern=SAFE_ID_PATTERN)]


class CreateQrPaymentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    merchant_id: SafeId
    amount_cents: Annotated[StrictInt, Field(gt=0, le=MAX_QR_AMOUNT_CENTS)]


class ProviderEventRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: SafeId
    reference: SafeId
    status: ProviderStatus
    occurred_at: datetime | None = None


class ProviderEventResult(BaseModel):
    result: str


class QrPaymentView(BaseModel):
    reference: str
    merchant_id: str
    amount_cents: int
    status: str
    status_label: str
    created_at: datetime
    status_updated_at: datetime


class QrPaymentListView(BaseModel):
    merchant_id: str
    items: list[QrPaymentView]
    total: int
    limit: int
    offset: int
    has_results: bool
    message: str | None
    reflect_deadline_seconds: int
    demo_enabled: bool  # provisional: la web muestra los controles de simulación solo si es True


class SimulateEventRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: ProviderStatus


class SimulateEventResult(BaseModel):
    result: str
    payment: QrPaymentView


class StatusChangeView(BaseModel):
    """Un cambio de estado visible. Sin payload crudo del proveedor, sin `event_id` ni secretos."""

    previous_status: str
    previous_status_label: str
    status: str
    status_label: str
    occurred_at: datetime
    received_at: datetime


class AttemptHistoryView(BaseModel):
    reference: str
    merchant_id: str
    items: list[StatusChangeView]  # orden cronológico


class MerchantStatusChangeView(StatusChangeView):
    reference: str


class MerchantHistoryView(BaseModel):
    merchant_id: str
    items: list[MerchantStatusChangeView]  # del más reciente al más antiguo
    total: int
    limit: int
    offset: int
    has_results: bool
    message: str | None
