"""Servicio del estado de pagos QR: creación, recepción de eventos y consulta con rango de fechas UTC."""
from datetime import date, datetime, timedelta, timezone

import pytest

from app.config import MerchantQrSettings
from app.repositories.sqlite_merchant_qr_store import SqliteMerchantQrStore
from app.services.merchant_qr_service import (
    AttemptSearch,
    InvalidDateRange,
    MerchantQrService,
    StatusHistorySearch,
    new_reference,
)

START = datetime(2026, 11, 6, 12, 0, tzinfo=timezone.utc)
MERCHANT = "TEST-m1"


@pytest.fixture
def service(db_path, clock):
    return MerchantQrService(SqliteMerchantQrStore(db_path, clock=clock), MerchantQrSettings(), clock)


def _search(service, **filters):
    return service.search_attempts(AttemptSearch(merchant_id=MERCHANT, **filters))


def test_cada_intento_nace_pendiente_con_referencia_propia_y_su_comercio(service):
    first = service.create_attempt("TEST-p1", MERCHANT, 100)
    second = service.create_attempt("TEST-p1", MERCHANT, 100)
    assert first.reference != second.reference
    assert first.reference.startswith("qr_")
    assert (first.merchant_id, first.status, first.created_at) == (MERCHANT, "PENDING", START)


def test_las_referencias_generadas_no_se_repiten():
    assert len({new_reference() for _ in range(1000)}) == 1000


def test_un_evento_valido_cambia_el_estado_visible(service):
    attempt = service.create_attempt("TEST-p1", MERCHANT, 100)
    assert service.receive_event("e1", attempt.reference, "SUCCEEDED", None) == "APPLIED"
    assert _search(service).items[0].status == "SUCCEEDED"


def test_un_estado_del_proveedor_sin_equivalente_no_se_muestra_tal_cual(service):
    attempt = service.create_attempt("TEST-p1", MERCHANT, 100)
    assert service.receive_event("e1", attempt.reference, "ESTADO_RARO", None) == "UNMAPPED_STATUS"
    assert _search(service).items[0].status == "PENDING"


def test_un_evento_con_hora_futura_no_bloquea_los_siguientes(service, clock):
    attempt = service.create_attempt("TEST-p1", MERCHANT, 100)
    future = clock() + timedelta(days=365)
    assert service.receive_event("e1", attempt.reference, "PENDING", future) == "APPLIED"
    clock.advance(seconds=5)
    assert service.receive_event("e2", attempt.reference, "SUCCEEDED", None) == "APPLIED"


def test_un_evento_sin_zona_horaria_se_interpreta_en_utc(service, clock):
    attempt = service.create_attempt("TEST-p1", MERCHANT, 100)
    clock.advance(minutes=1)
    naive = datetime(2026, 11, 6, 12, 0, 30)
    assert service.receive_event("e1", attempt.reference, "SUCCEEDED", naive) == "APPLIED"
    assert _search(service).items[0].status_updated_at == naive.replace(tzinfo=timezone.utc)


def test_el_evento_anterior_a_la_creacion_es_fuera_de_orden(service, clock):
    attempt = service.create_attempt("TEST-p1", MERCHANT, 100)
    clock.advance(minutes=1)
    old = clock() - timedelta(hours=1)
    assert service.receive_event("e1", attempt.reference, "SUCCEEDED", old) == "OUT_OF_ORDER"


def test_el_rango_de_fechas_es_por_dia_utc_inclusivo(service, clock):
    for days in (0, 1, 2):
        service.create_attempt("TEST-p1", MERCHANT, 100 + days)
        clock.advance(days=1)
    day_one = _search(service, date_from=date(2026, 11, 7), date_to=date(2026, 11, 7))
    assert [item.amount_cents for item in day_one.items] == [101]
    assert _search(service, date_from=date(2026, 11, 7)).total == 2
    assert _search(service, date_to=date(2026, 11, 7)).total == 2
    assert _search(service, date_from=date(2026, 11, 6), date_to=date(2026, 11, 8)).total == 3


def test_un_rango_invertido_se_rechaza(service):
    with pytest.raises(InvalidDateRange):
        _search(service, date_from=date(2026, 11, 8), date_to=date(2026, 11, 7))


def test_el_historial_calcula_el_estado_anterior_y_filtra_por_fecha_del_evento(service, clock):
    attempt = service.create_attempt("TEST-p1", MERCHANT, 100)
    clock.advance(seconds=1)
    service.receive_event("e1", attempt.reference, "PENDING", None)
    clock.advance(days=1)
    service.receive_event("e2", attempt.reference, "SUCCEEDED", None)
    everything = service.search_status_changes(StatusHistorySearch(merchant_id=MERCHANT))
    assert [(c.previous_status, c.status) for c in everything.items] == [("PENDING", "SUCCEEDED"),
                                                                         ("PENDING", "PENDING")]
    day_two = service.search_status_changes(
        StatusHistorySearch(merchant_id=MERCHANT, date_from=date(2026, 11, 7), date_to=date(2026, 11, 7)))
    assert [c.status for c in day_two.items] == ["SUCCEEDED"]  # el estado anterior no depende del rango
    assert day_two.items[0].previous_status == "PENDING"
    with pytest.raises(InvalidDateRange):
        service.search_status_changes(
            StatusHistorySearch(merchant_id=MERCHANT, date_from=date(2026, 11, 8), date_to=date(2026, 11, 7)))


def test_el_historial_de_un_intento_es_cronologico_y_none_si_no_es_del_comercio(service, clock):
    attempt = service.create_attempt("TEST-p1", MERCHANT, 100)
    clock.advance(seconds=1)
    service.receive_event("e1", attempt.reference, "PENDING", None)
    clock.advance(seconds=1)
    service.receive_event("e2", attempt.reference, "FAILED", None)
    changes = service.attempt_history(MERCHANT, attempt.reference)
    assert [c.status for c in changes] == ["PENDING", "FAILED"]
    assert service.attempt_history("TEST-otro", attempt.reference) is None
    assert service.attempt_history(MERCHANT, "qr_inexistente") is None


def test_simular_un_evento_usa_ids_unicos_y_la_misma_regla_que_el_callback(service, clock):
    attempt = service.create_attempt("TEST-p1", MERCHANT, 100)
    clock.advance(seconds=1)
    outcome, refreshed = service.simulate_event(MERCHANT, attempt.reference, "SUCCEEDED")
    assert (outcome, refreshed.status) == ("APPLIED", "SUCCEEDED")
    clock.advance(seconds=1)
    assert service.simulate_event(MERCHANT, attempt.reference, "FAILED")[0] == "ALREADY_TERMINAL"
    assert service.simulate_event("TEST-otro", attempt.reference, "FAILED") is None


def test_el_filtro_de_estado_se_aplica_en_la_busqueda(service, clock):
    paid = service.create_attempt("TEST-p1", MERCHANT, 100)
    service.create_attempt("TEST-p1", MERCHANT, 200)
    clock.advance(seconds=1)
    service.receive_event("e1", paid.reference, "SUCCEEDED", None)
    assert [a.reference for a in _search(service, status="SUCCEEDED").items] == [paid.reference]
    assert _search(service, status="PENDING").total == 1
