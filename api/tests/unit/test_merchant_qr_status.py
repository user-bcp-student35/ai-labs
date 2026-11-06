"""Mapeo de estados y regla de aplicación de eventos (tareas 1.2, 2.3). Conjunto y mapeo provisionales (OQ-24)."""
from datetime import datetime, timedelta, timezone

import pytest

from app.config import MerchantQrSettings
from app.ports.merchant_qr_store import ProviderEvent, QrAttempt
from app.services.merchant_qr_status import StatusMapper, decide_outcome

NOW = datetime(2026, 11, 6, 12, 0, tzinfo=timezone.utc)
TERMINAL = MerchantQrSettings().terminal_statuses


def _attempt(status="PENDING", updated_at=NOW):
    return QrAttempt(reference="qr_1", merchant_id="TEST-m1", payer_id="TEST-p1", amount_cents=100, status=status,
                     created_at=NOW, status_updated_at=updated_at)


def _event(merchant_status="SUCCEEDED", occurred_at=NOW + timedelta(seconds=1)):
    return ProviderEvent(event_id="e1", reference="qr_1", provider_status="X", merchant_status=merchant_status,
                         occurred_at=occurred_at)


@pytest.mark.parametrize("provider_status, expected", [
    ("SUCCEEDED", "SUCCEEDED"), ("succeeded", "SUCCEEDED"), (" rejected ", "FAILED"), ("EXPIRED", "EXPIRED"),
    ("PENDING", "PENDING"), ("ALGO_NUEVO", None), ("", None)])
def test_el_mapeo_convierte_estados_del_proveedor_o_devuelve_none(provider_status, expected):
    assert StatusMapper(MerchantQrSettings()).to_merchant_status(provider_status) == expected


def test_el_mapeo_es_configurable():
    mapper = StatusMapper(MerchantQrSettings(provider_status_map={"OK": "SUCCEEDED"}))
    assert mapper.to_merchant_status("ok") == "SUCCEEDED"
    assert mapper.to_merchant_status("REJECTED") is None


def test_un_evento_valido_posterior_se_aplica():
    assert decide_outcome(_attempt(), _event(), TERMINAL) == "APPLIED"


def test_un_estado_no_mapeado_no_se_aplica():
    assert decide_outcome(_attempt(), _event(merchant_status=None), TERMINAL) == "UNMAPPED_STATUS"


def test_un_evento_anterior_al_ultimo_aplicado_es_fuera_de_orden():
    outcome = decide_outcome(_attempt(updated_at=NOW), _event(occurred_at=NOW - timedelta(seconds=1)), TERMINAL)
    assert outcome == "OUT_OF_ORDER"


def test_un_intento_terminal_no_se_sobrescribe():
    assert decide_outcome(_attempt(status="SUCCEEDED"), _event("FAILED"), TERMINAL) == "ALREADY_TERMINAL"


def test_un_evento_con_la_misma_marca_de_tiempo_se_aplica():
    assert decide_outcome(_attempt(updated_at=NOW), _event(occurred_at=NOW), TERMINAL) == "APPLIED"
