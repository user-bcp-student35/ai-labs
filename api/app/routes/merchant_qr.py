"""Rutas del estado de pagos QR: creación provisional del intento (OQ-08), callback del proveedor y consulta del
comercio. HTTP, esquemas e identidad; las reglas viven en el servicio."""
from __future__ import annotations

import hmac
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Query, Request, status

from app.content import Content
from app.ports.merchant_qr_store import QrAttempt, StatusChange
from app.routes.dependencies import RequestContext, merchant_id_of, request_context, services_of
from app.schemas_merchant import (
    MAX_ID_LENGTH,
    MAX_PROVIDER_STATUS_LENGTH,
    SAFE_ID_PATTERN,
    AttemptHistoryView,
    CreateQrPaymentRequest,
    MerchantHistoryView,
    MerchantStatusChangeView,
    ProviderEventRequest,
    ProviderEventResult,
    QrPaymentListView,
    QrPaymentView,
    SimulateEventRequest,
    SimulateEventResult,
    StatusChangeView,
)
from app.services.merchant_qr_service import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    AttemptSearch,
    InvalidDateRange,
    MerchantQrService,
    StatusHistorySearch,
)

PROVIDER_SECRET_HEADER = "X-Provider-Secret"
MAX_PAGE_OFFSET = 100_000
HTTP_UNPROCESSABLE = 422  # la constante de starlette cambió de nombre entre versiones
NO_RESULTS_MESSAGE = "No hay resultados para los filtros aplicados."

CALLBACK_NOT_CONFIGURED = (status.HTTP_503_SERVICE_UNAVAILABLE, "PROVIDER_CALLBACK_NOT_CONFIGURED",
                           "La recepción de eventos del proveedor no está disponible en este momento.")
CALLBACK_UNAUTHORIZED = (status.HTTP_401_UNAUTHORIZED, "PROVIDER_SECRET_INVALID",
                         "No se pudo autenticar el origen del evento.")
INVALID_DATE_RANGE = (HTTP_UNPROCESSABLE, "INVALID_DATE_RANGE", "La fecha inicial no puede ser posterior a la final.")
INVALID_STATUS = (HTTP_UNPROCESSABLE, "INVALID_STATUS", "El estado indicado no pertenece al conjunto del comercio.")
PAYMENT_NOT_FOUND = (status.HTTP_404_NOT_FOUND, "QR_PAYMENT_NOT_FOUND", "No se encontró el pago QR indicado.")
DEMO_DISABLED = (status.HTTP_404_NOT_FOUND, "NOT_FOUND", "Recurso no disponible.")

router = APIRouter()


def _error(spec: tuple[int, str, str]) -> HTTPException:
    status_code, code, message = spec
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


def merchant_qr_service(request: Request) -> MerchantQrService:
    return services_of(request).merchant_qr


Service = Annotated[MerchantQrService, Depends(merchant_qr_service)]
MerchantId = Annotated[str, Depends(merchant_id_of)]
PayerContext = Annotated[RequestContext, Depends(request_context)]


def require_provider_secret(request: Request,
                            x_provider_secret: Annotated[str | None, Header()] = None) -> None:
    expected = request.app.state.settings.merchant_qr.callback_secret
    if not expected:
        raise _error(CALLBACK_NOT_CONFIGURED)  # cerrado por defecto: sin secreto no se acepta ningún evento
    # Comparación en tiempo constante; un encabezado ausente se trata como vacío.
    if not hmac.compare_digest((x_provider_secret or "").encode(), expected.encode()):
        raise _error(CALLBACK_UNAUTHORIZED)


def require_demo_enabled(request: Request) -> None:
    """Provisional: la simulación de eventos solo existe con `MERCH_QR_DEMO_ENABLED=true`; si no, es un 404."""
    if not request.app.state.settings.merchant_qr.demo_enabled:
        raise _error(DEMO_DISABLED)


def _status_label(content: Content, status_value: str) -> str:
    try:
        return content.status_label(status_value)
    except KeyError:
        return status_value  # estado configurado sin etiqueta propia: se muestra su código


def _payment_view(content: Content, attempt: QrAttempt) -> QrPaymentView:
    return QrPaymentView(
        reference=attempt.reference, merchant_id=attempt.merchant_id, amount_cents=attempt.amount_cents,
        status=attempt.status, status_label=_status_label(content, attempt.status),
        created_at=attempt.created_at, status_updated_at=attempt.status_updated_at)


@router.post("/merchant/qr-payments", response_model=QrPaymentView, status_code=status.HTTP_201_CREATED)
def create_qr_payment(body: CreateQrPaymentRequest, service: Service, context: PayerContext, request: Request):
    """Provisional (OQ-08): crea un intento QR del pagador autenticado hacia el comercio indicado."""
    attempt = service.create_attempt(context.payer_id, body.merchant_id, body.amount_cents)
    return _payment_view(services_of(request).content, attempt)


@router.post("/provider/qr-events", response_model=ProviderEventResult,
             dependencies=[Depends(require_provider_secret)])
def receive_provider_event(body: ProviderEventRequest, service: Service):
    return ProviderEventResult(
        result=service.receive_event(body.event_id, body.reference, body.status, body.occurred_at))


@router.get("/merchant/qr-payments", response_model=QrPaymentListView)
def list_qr_payments(
    service: Service, merchant_id: MerchantId, request: Request,
    reference: Annotated[str | None, Query(min_length=1, max_length=MAX_ID_LENGTH, pattern=SAFE_ID_PATTERN)] = None,
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
    status_filter: Annotated[str | None, Query(alias="status", min_length=1, max_length=MAX_PROVIDER_STATUS_LENGTH,
                                               pattern=SAFE_ID_PATTERN)] = None,
    limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
    offset: Annotated[int, Query(ge=0, le=MAX_PAGE_OFFSET)] = 0,
):
    settings = request.app.state.settings.merchant_qr
    wanted_status = status_filter.upper() if status_filter else None
    if wanted_status is not None and wanted_status not in settings.statuses:
        raise _error(INVALID_STATUS)
    search = AttemptSearch(merchant_id=merchant_id, reference=reference, date_from=date_from, date_to=date_to,
                           status=wanted_status, limit=limit, offset=offset)
    try:
        page = service.search_attempts(search)
    except InvalidDateRange:
        raise _error(INVALID_DATE_RANGE) from None
    content = services_of(request).content
    return QrPaymentListView(
        merchant_id=merchant_id, items=[_payment_view(content, attempt) for attempt in page.items],
        total=page.total, limit=limit, offset=offset, has_results=page.total > 0,
        message=None if page.total > 0 else NO_RESULTS_MESSAGE,
        reflect_deadline_seconds=settings.reflect_deadline_seconds, demo_enabled=settings.demo_enabled)


def _change_view(content: Content, change: StatusChange) -> dict:
    return {"previous_status": change.previous_status,
            "previous_status_label": _status_label(content, change.previous_status),
            "status": change.status, "status_label": _status_label(content, change.status),
            "occurred_at": change.occurred_at, "received_at": change.received_at}


@router.get("/merchant/qr-payments/history", response_model=MerchantHistoryView)
def merchant_status_history(
    service: Service, merchant_id: MerchantId, request: Request,
    reference: Annotated[str | None, Query(min_length=1, max_length=MAX_ID_LENGTH, pattern=SAFE_ID_PATTERN)] = None,
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
    offset: Annotated[int, Query(ge=0, le=MAX_PAGE_OFFSET)] = 0,
):
    """Una fila por cambio de estado del comercio; las fechas filtran por la fecha UTC del EVENTO."""
    search = StatusHistorySearch(merchant_id=merchant_id, reference=reference, date_from=date_from,
                                 date_to=date_to, limit=limit, offset=offset)
    try:
        page = service.search_status_changes(search)
    except InvalidDateRange:
        raise _error(INVALID_DATE_RANGE) from None
    content = services_of(request).content
    return MerchantHistoryView(
        merchant_id=merchant_id,
        items=[MerchantStatusChangeView(reference=change.reference, **_change_view(content, change))
               for change in page.items],
        total=page.total, limit=limit, offset=offset, has_results=page.total > 0,
        message=None if page.total > 0 else NO_RESULTS_MESSAGE)


@router.get("/merchant/qr-payments/{reference}/history", response_model=AttemptHistoryView)
def attempt_status_history(
    reference: Annotated[str, Path(min_length=1, max_length=MAX_ID_LENGTH, pattern=SAFE_ID_PATTERN)],
    service: Service, merchant_id: MerchantId, request: Request,
):
    changes = service.attempt_history(merchant_id, reference)
    if changes is None:
        raise _error(PAYMENT_NOT_FOUND)
    content = services_of(request).content
    return AttemptHistoryView(
        reference=reference, merchant_id=merchant_id,
        items=[StatusChangeView(**_change_view(content, change)) for change in changes])


@router.post("/merchant/qr-payments/{reference}/simulate-event", response_model=SimulateEventResult,
             dependencies=[Depends(require_demo_enabled)])
def simulate_qr_event(
    reference: Annotated[str, Path(min_length=1, max_length=MAX_ID_LENGTH, pattern=SAFE_ID_PATTERN)],
    body: SimulateEventRequest, service: Service, merchant_id: MerchantId, request: Request,
):
    """DEMO provisional, solo local (`MERCH_QR_DEMO_ENABLED`): evento del proveedor por el mismo servicio del callback."""
    simulated = service.simulate_event(merchant_id, reference, body.status)
    if simulated is None:
        raise _error(PAYMENT_NOT_FOUND)
    outcome, attempt = simulated
    return SimulateEventResult(result=outcome, payment=_payment_view(services_of(request).content, attempt))
