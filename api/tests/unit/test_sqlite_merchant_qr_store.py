"""Almacén SQLite de intentos QR del comercio: referencia única, historial append-only, deduplicación, alcance."""
import os
import sqlite3
from datetime import datetime, timedelta, timezone

import pytest

from app.config import MerchantQrSettings
from app.ports.merchant_qr_store import AttemptQuery, ProviderEvent, QrAttempt
from app.repositories.sqlite_merchant_qr_store import SqliteMerchantQrStore
from app.services.merchant_qr_status import decide_outcome

T0 = datetime(2026, 11, 6, 12, 0, tzinfo=timezone.utc)
TERMINAL = MerchantQrSettings().terminal_statuses


def _attempt(reference="qr_1", merchant="TEST-m1", created=T0):
    return QrAttempt(reference=reference, merchant_id=merchant, payer_id="TEST-p1", amount_cents=100,
                     status="PENDING", created_at=created, status_updated_at=created)


def _event(event_id="e1", reference="qr_1", status="SUCCEEDED", seconds=1, provider_status="SUCCEEDED"):
    return ProviderEvent(event_id=event_id, reference=reference, provider_status=provider_status,
                         merchant_status=status, occurred_at=T0 + timedelta(seconds=seconds))


def _apply(store, event):
    return store.apply_event(event, lambda attempt: decide_outcome(attempt, event, TERMINAL))


@pytest.fixture
def merchant_store(db_path):
    return SqliteMerchantQrStore(db_path, clock=lambda: T0)


def test_no_crea_archivo_ni_tablas_hasta_el_primer_uso(tmp_path):
    path = tmp_path / "lazy.sqlite3"
    SqliteMerchantQrStore(str(path))
    assert not path.exists()


def test_la_referencia_es_unica(merchant_store):
    merchant_store.create_attempt(_attempt("qr_1"))
    with pytest.raises(sqlite3.IntegrityError):
        merchant_store.create_attempt(_attempt("qr_1", merchant="TEST-m2"))


def test_un_monto_no_positivo_se_rechaza_en_el_almacen(merchant_store):
    bad = QrAttempt("qr_x", "TEST-m1", "TEST-p1", 0, "PENDING", T0, T0)
    with pytest.raises(sqlite3.IntegrityError):
        merchant_store.create_attempt(bad)


def test_el_evento_aplicado_cambia_el_estado_y_queda_en_el_historial(merchant_store):
    merchant_store.create_attempt(_attempt())
    assert _apply(merchant_store, _event()) == "APPLIED"
    attempt = merchant_store.search_attempts(AttemptQuery(merchant_id="TEST-m1")).items[0]
    assert attempt.status == "SUCCEEDED"
    assert attempt.status_updated_at == T0 + timedelta(seconds=1)
    [stored] = merchant_store.list_events("qr_1")
    assert (stored.event_id, stored.merchant_status, stored.applied) == ("e1", "SUCCEEDED", True)


def test_el_evento_duplicado_no_altera_estado_ni_historial(merchant_store):
    merchant_store.create_attempt(_attempt())
    _apply(merchant_store, _event())
    before = merchant_store.list_events("qr_1")
    assert _apply(merchant_store, _event()) == "DUPLICATE"
    assert merchant_store.list_events("qr_1") == before


def test_el_duplicado_no_cambia_el_estado_aunque_traiga_otro_contenido(merchant_store):
    merchant_store.create_attempt(_attempt())
    _apply(merchant_store, _event(status="SUCCEEDED"))
    assert _apply(merchant_store, _event(status="FAILED", provider_status="FAILED")) == "DUPLICATE"
    assert merchant_store.search_attempts(AttemptQuery(merchant_id="TEST-m1")).items[0].status == "SUCCEEDED"


def test_el_evento_fuera_de_orden_se_registra_sin_revertir_el_estado(merchant_store):
    merchant_store.create_attempt(_attempt())
    _apply(merchant_store, _event("e2", status="PENDING", seconds=10, provider_status="PENDING"))
    assert _apply(merchant_store, _event("e1", status="FAILED", seconds=5)) == "OUT_OF_ORDER"
    attempt = merchant_store.search_attempts(AttemptQuery(merchant_id="TEST-m1")).items[0]
    assert attempt.status == "PENDING"
    assert [(item.event_id, item.applied) for item in merchant_store.list_events("qr_1")] == [
        ("e2", True), ("e1", False)]


def test_el_estado_terminal_no_se_sobrescribe(merchant_store):
    merchant_store.create_attempt(_attempt())
    _apply(merchant_store, _event("e1", status="SUCCEEDED", seconds=1))
    assert _apply(merchant_store, _event("e2", status="FAILED", seconds=2)) == "ALREADY_TERMINAL"
    assert merchant_store.search_attempts(AttemptQuery(merchant_id="TEST-m1")).items[0].status == "SUCCEEDED"


def test_el_estado_no_mapeado_no_cambia_el_estado_y_queda_para_revision(merchant_store):
    merchant_store.create_attempt(_attempt())
    event = _event(status=None, provider_status="RARO")
    assert _apply(merchant_store, event) == "UNMAPPED_STATUS"
    assert _apply(merchant_store, event) == "DUPLICATE"
    assert merchant_store.search_attempts(AttemptQuery(merchant_id="TEST-m1")).items[0].status == "PENDING"
    [case] = merchant_store.list_review_cases(10)
    assert (case.reason, case.reference, case.provider_status) == ("UNMAPPED_STATUS", "qr_1", "RARO")


def test_la_referencia_desconocida_no_crea_intento_y_queda_para_revision(merchant_store):
    outcome = _apply(merchant_store, _event(reference="qr_fantasma"))
    assert outcome == "UNKNOWN_REFERENCE"
    assert merchant_store.search_attempts(AttemptQuery(merchant_id="TEST-m1")).total == 0
    assert merchant_store.list_events("qr_fantasma") == []
    [case] = merchant_store.list_review_cases(10)
    assert (case.reason, case.reference, case.event_id) == ("UNKNOWN_REFERENCE", "qr_fantasma", "e1")


def test_el_reintento_de_una_referencia_desconocida_no_duplica_el_caso(merchant_store):
    _apply(merchant_store, _event(reference="qr_fantasma"))
    _apply(merchant_store, _event(reference="qr_fantasma"))
    assert len(merchant_store.list_review_cases(10)) == 1


def test_el_historial_y_los_casos_son_append_only(merchant_store, db_path):
    merchant_store.create_attempt(_attempt())
    _apply(merchant_store, _event())
    _apply(merchant_store, _event("e9", reference="qr_fantasma"))
    con = sqlite3.connect(db_path)
    try:
        for statement in ("UPDATE merchant_qr_events SET applied = 0", "DELETE FROM merchant_qr_events",
                          "UPDATE merchant_qr_review_cases SET reason = reason",
                          "DELETE FROM merchant_qr_review_cases"):
            with pytest.raises(sqlite3.DatabaseError, match="append-only"):
                con.execute(statement)
    finally:
        con.close()


def test_la_consulta_solo_devuelve_intentos_del_comercio(merchant_store):
    merchant_store.create_attempt(_attempt("qr_a", "TEST-m1"))
    merchant_store.create_attempt(_attempt("qr_b", "TEST-m2"))
    page = merchant_store.search_attempts(AttemptQuery(merchant_id="TEST-m1"))
    assert [item.reference for item in page.items] == ["qr_a"]
    assert merchant_store.search_attempts(AttemptQuery(merchant_id="TEST-m1", reference="qr_b")).total == 0


def test_la_consulta_ordena_del_mas_reciente_y_pagina(merchant_store):
    for index in range(5):
        merchant_store.create_attempt(_attempt(f"qr_{index}", created=T0 + timedelta(minutes=index)))
    page = merchant_store.search_attempts(AttemptQuery(merchant_id="TEST-m1", limit=2, offset=1))
    assert [item.reference for item in page.items] == ["qr_3", "qr_2"]
    assert page.total == 5


def test_el_filtro_de_fecha_es_inclusivo_al_inicio_y_exclusivo_al_final(merchant_store):
    for reference, minutes in (("qr_antes", -1), ("qr_inicio", 0), ("qr_dentro", 30), ("qr_fin", 60)):
        merchant_store.create_attempt(_attempt(reference, created=T0 + timedelta(minutes=minutes)))
    query = AttemptQuery(merchant_id="TEST-m1", created_from=T0, created_before=T0 + timedelta(minutes=60))
    assert {item.reference for item in merchant_store.search_attempts(query).items} == {"qr_inicio", "qr_dentro"}


def test_los_valores_de_filtro_se_parametrizan(merchant_store):
    merchant_store.create_attempt(_attempt())
    hostile = "qr_1' OR '1'='1"
    assert merchant_store.search_attempts(AttemptQuery(merchant_id="TEST-m1", reference=hostile)).total == 0
    assert merchant_store.search_attempts(AttemptQuery(merchant_id="x' OR '1'='1")).total == 0


def test_el_esquema_se_crea_en_el_mismo_archivo(merchant_store, db_path):
    merchant_store.create_attempt(_attempt())
    assert os.path.exists(db_path)
