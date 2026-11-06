"""Servicio del estado de pagos QR del comercio (HU-MERCH): crea intentos, aplica eventos del proveedor y consulta
con alcance de comercio. Depende del puerto de almacén, no de SQLite."""
from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

from app.config import MERCH_INITIAL_STATUS, MerchantQrSettings
from app.ports.merchant_qr_store import (
    AttemptPage,
    AttemptQuery,
    MerchantQrStorePort,
    ProviderEvent,
    QrAttempt,
    StatusChange,
    StatusChangePage,
    StatusChangeQuery,
)
from app.services.merchant_qr_status import StatusMapper, decide_outcome

REFERENCE_PREFIX = "qr_"
SIMULATED_EVENT_PREFIX = "sim-"
MAX_ATTEMPT_HISTORY = 500  # tope de cordura del historial de un solo intento (en la práctica son pocos cambios)
MAX_PAGE_SIZE = 200
DEFAULT_PAGE_SIZE = 50
ONE_DAY = timedelta(days=1)


class InvalidDateRange(Exception):
    """`date_from` es posterior a `date_to`."""


@dataclass(frozen=True)
class AttemptSearch:
    merchant_id: str
    reference: str | None = None
    date_from: date | None = None  # fecha UTC de creación, inclusiva
    date_to: date | None = None  # fecha UTC de creación, inclusiva
    status: str | None = None  # ya validado contra el conjunto del comercio en el borde
    limit: int = DEFAULT_PAGE_SIZE
    offset: int = 0


@dataclass(frozen=True)
class StatusHistorySearch:
    merchant_id: str
    reference: str | None = None
    date_from: date | None = None  # fecha UTC del evento (`occurred_at`), inclusiva
    date_to: date | None = None  # fecha UTC del evento (`occurred_at`), inclusiva
    limit: int = DEFAULT_PAGE_SIZE
    offset: int = 0


def _date_bounds(date_from: date | None, date_to: date | None) -> tuple[datetime | None, datetime | None]:
    """Rango `[inicio, fin)` en UTC a partir de fechas inclusivas; lanza `InvalidDateRange` si están invertidas."""
    if date_from and date_to and date_from > date_to:
        raise InvalidDateRange
    return (_start_of_day_utc(date_from) if date_from else None,
            _start_of_day_utc(date_to) + ONE_DAY if date_to else None)


def _start_of_day_utc(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=timezone.utc)


def _as_utc(moment: datetime) -> datetime:
    return moment.replace(tzinfo=timezone.utc) if moment.tzinfo is None else moment.astimezone(timezone.utc)


def new_reference() -> str:
    return f"{REFERENCE_PREFIX}{uuid.uuid4().hex}"


class MerchantQrService:
    def __init__(self, store: MerchantQrStorePort, settings: MerchantQrSettings,
                 clock: Callable[[], datetime]) -> None:
        self._store = store
        self._settings = settings
        self._clock = clock
        self._mapper = StatusMapper(settings)

    def create_attempt(self, payer_id: str, merchant_id: str, amount_cents: int) -> QrAttempt:
        now = self._clock()
        attempt = QrAttempt(reference=new_reference(), merchant_id=merchant_id, payer_id=payer_id,
                            amount_cents=amount_cents, status=MERCH_INITIAL_STATUS, created_at=now,
                            status_updated_at=now)
        return self._store.create_attempt(attempt)

    def receive_event(self, event_id: str, reference: str, provider_status: str,
                      occurred_at: datetime | None) -> str:
        """Aplica un evento ya autenticado en el borde. Sin `occurred_at`, o si viene del futuro, se usa el momento
        de recepción: un reloj adelantado del proveedor no puede bloquear los eventos siguientes."""
        received_at = self._clock()
        event = ProviderEvent(
            event_id=event_id, reference=reference, provider_status=provider_status,
            merchant_status=self._mapper.to_merchant_status(provider_status),
            occurred_at=min(_as_utc(occurred_at), received_at) if occurred_at else received_at)
        terminal = self._settings.terminal_statuses
        return self._store.apply_event(event, lambda attempt: decide_outcome(attempt, event, terminal))

    def search_attempts(self, search: AttemptSearch) -> AttemptPage:
        created_from, created_before = _date_bounds(search.date_from, search.date_to)
        return self._store.search_attempts(AttemptQuery(
            merchant_id=search.merchant_id, reference=search.reference, created_from=created_from,
            created_before=created_before, status=search.status, limit=search.limit, offset=search.offset))

    def find_attempt(self, merchant_id: str, reference: str) -> QrAttempt | None:
        """El intento solo si es del comercio: uno ajeno y uno inexistente son indistinguibles."""
        page = self._store.search_attempts(AttemptQuery(merchant_id=merchant_id, reference=reference, limit=1))
        return page.items[0] if page.items else None

    def search_status_changes(self, search: StatusHistorySearch) -> StatusChangePage:
        """Historial de cambios de estado del comercio (el más reciente primero), filtrable por fecha del evento."""
        occurred_from, occurred_before = _date_bounds(search.date_from, search.date_to)
        return self._store.search_status_changes(StatusChangeQuery(
            merchant_id=search.merchant_id, initial_status=MERCH_INITIAL_STATUS, reference=search.reference,
            occurred_from=occurred_from, occurred_before=occurred_before, limit=search.limit,
            offset=search.offset))

    def attempt_history(self, merchant_id: str, reference: str) -> list[StatusChange] | None:
        """Cambios de estado de un intento en orden cronológico; None si no es del comercio."""
        if self.find_attempt(merchant_id, reference) is None:
            return None
        return self._store.search_status_changes(StatusChangeQuery(
            merchant_id=merchant_id, initial_status=MERCH_INITIAL_STATUS, reference=reference, newest_first=False,
            limit=MAX_ATTEMPT_HISTORY)).items

    def simulate_event(self, merchant_id: str, reference: str,
                       provider_status: str) -> tuple[str, QrAttempt] | None:
        """DEMO (provisional): aplica un evento por la MISMA ruta que el callback real, con `event_id` único.
        None si el intento no es del comercio."""
        if self.find_attempt(merchant_id, reference) is None:
            return None
        outcome = self.receive_event(f"{SIMULATED_EVENT_PREFIX}{uuid.uuid4().hex}", reference, provider_status, None)
        refreshed = self.find_attempt(merchant_id, reference)
        return (outcome, refreshed) if refreshed else None
