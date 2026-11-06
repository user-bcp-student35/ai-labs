"""Estados del comercio para pagos QR: mapeo configurable desde el estado del proveedor y regla de aplicación de
eventos. Conjunto, mapeo y plazos son PROVISIONALES (OQ-24, OQ-26): se leen de la configuración."""
from __future__ import annotations

from app.config import MerchantQrSettings
from app.ports.merchant_qr_store import (
    OUTCOME_ALREADY_TERMINAL,
    OUTCOME_APPLIED,
    OUTCOME_OUT_OF_ORDER,
    OUTCOME_UNMAPPED_STATUS,
    ProviderEvent,
    QrAttempt,
)


class StatusMapper:
    def __init__(self, settings: MerchantQrSettings) -> None:
        self._map = {key.strip().upper(): value for key, value in settings.provider_status_map.items()}

    def to_merchant_status(self, provider_status: str) -> str | None:
        """Estado del conjunto del comercio, o None si el estado del proveedor no tiene equivalente."""
        return self._map.get(provider_status.strip().upper())


def decide_outcome(attempt: QrAttempt, event: ProviderEvent, terminal_statuses: frozenset[str]) -> str:
    """Regla de aplicación (guard clauses): un estado no mapeado, un evento anterior al último aplicado o un
    intento ya terminal nunca cambian el estado visible; lo demás sí."""
    if event.merchant_status is None:
        return OUTCOME_UNMAPPED_STATUS
    if event.occurred_at < attempt.status_updated_at:
        return OUTCOME_OUT_OF_ORDER
    if attempt.status in terminal_statuses:
        return OUTCOME_ALREADY_TERMINAL
    return OUTCOME_APPLIED
