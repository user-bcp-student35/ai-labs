"""Puerto del almacén de intentos de pago QR del comercio (HU-MERCH). Historial de eventos append-only y estado
visible proyectado en la misma transacción. Un solo puerto porque aplicar un evento y actualizar el estado deben
ser atómicos."""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

# Resultado de aplicar un evento del proveedor.
OUTCOME_APPLIED = "APPLIED"
OUTCOME_DUPLICATE = "DUPLICATE"
OUTCOME_OUT_OF_ORDER = "OUT_OF_ORDER"
OUTCOME_ALREADY_TERMINAL = "ALREADY_TERMINAL"
OUTCOME_UNMAPPED_STATUS = "UNMAPPED_STATUS"
OUTCOME_UNKNOWN_REFERENCE = "UNKNOWN_REFERENCE"

# Motivos del registro para revisión operativa.
REVIEW_UNKNOWN_REFERENCE = "UNKNOWN_REFERENCE"
REVIEW_UNMAPPED_STATUS = "UNMAPPED_STATUS"
REVIEW_REASONS = (REVIEW_UNKNOWN_REFERENCE, REVIEW_UNMAPPED_STATUS)


@dataclass(frozen=True)
class QrAttempt:
    reference: str
    merchant_id: str
    payer_id: str
    amount_cents: int
    status: str
    created_at: datetime
    status_updated_at: datetime  # momento (del proveedor) del último evento aplicado; al crear, la creación


@dataclass(frozen=True)
class ProviderEvent:
    event_id: str
    reference: str
    provider_status: str
    merchant_status: str | None  # None = el estado del proveedor no tiene equivalente configurado
    occurred_at: datetime


@dataclass(frozen=True)
class StoredEvent:
    event_id: str
    provider_status: str
    merchant_status: str | None
    occurred_at: datetime
    applied: bool


@dataclass(frozen=True)
class ReviewCase:
    reason: str
    reference: str
    event_id: str
    provider_status: str
    recorded_at: datetime


@dataclass(frozen=True)
class AttemptQuery:
    """El comercio es obligatorio: ninguna consulta existe sin alcance de comercio."""

    merchant_id: str
    reference: str | None = None
    created_from: datetime | None = None  # inclusivo
    created_before: datetime | None = None  # exclusivo
    status: str | None = None
    limit: int = 50
    offset: int = 0


@dataclass(frozen=True)
class AttemptPage:
    items: list[QrAttempt]
    total: int


@dataclass(frozen=True)
class StatusChange:
    """Un evento aplicado: cambió o confirmó el estado visible. `previous_status` es el estado visible justo antes."""

    reference: str
    previous_status: str
    status: str
    occurred_at: datetime
    received_at: datetime


@dataclass(frozen=True)
class StatusChangeQuery:
    """Historial de cambios de estado; el comercio es obligatorio. Fechas sobre `occurred_at` del evento."""

    merchant_id: str
    initial_status: str  # estado anterior del primer cambio de cada intento
    reference: str | None = None
    occurred_from: datetime | None = None  # inclusivo
    occurred_before: datetime | None = None  # exclusivo
    newest_first: bool = True
    limit: int = 50
    offset: int = 0


@dataclass(frozen=True)
class StatusChangePage:
    items: list[StatusChange]
    total: int


# Decide el resultado a partir del intento actual; se ejecuta dentro de la transacción del almacén.
OutcomeDecider = Callable[[QrAttempt], str]


class MerchantQrStorePort(Protocol):
    def create_attempt(self, attempt: QrAttempt) -> QrAttempt: ...

    def apply_event(self, event: ProviderEvent, decide: OutcomeDecider) -> str: ...

    def search_attempts(self, query: AttemptQuery) -> AttemptPage: ...

    def search_status_changes(self, query: StatusChangeQuery) -> StatusChangePage: ...

    def list_events(self, reference: str) -> list[StoredEvent]: ...

    def list_review_cases(self, limit: int) -> list[ReviewCase]: ...
