"""Aceptación HTTP de extremo a extremo: historial de estados (por intento y del comercio), filtro `status`,
simulación de eventos de demostración y `demo_enabled`. Todo PROVISIONAL (OQ-24 a OQ-28 siguen abiertas)."""
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

SECRET = "TEST-secreto-proveedor"
PAYER = {"X-Payer-Id": "TEST-payer-1"}
M1 = {"X-Merchant-Id": "TEST-comercio-1"}
M2 = {"X-Merchant-Id": "TEST-comercio-2"}
PROVIDER = {"X-Provider-Secret": SECRET}
LIST_PATH = "/merchant/qr-payments"
HISTORY_PATH = "/merchant/qr-payments/history"
EVENTS_PATH = "/provider/qr-events"


def _build(store, provider, clock, make_settings, db_path, demo):
    settings = make_settings(db_path=db_path)
    merchant_qr = replace(settings.merchant_qr, callback_secret=SECRET, demo_enabled=demo)
    settings = replace(settings, merchant_qr=merchant_qr)
    return TestClient(create_app(settings=settings, provider=provider, store=store, clock=clock))


@pytest.fixture
def demo_client(store, provider, clock, make_settings, db_path):
    return _build(store, provider, clock, make_settings, db_path, demo=True)


@pytest.fixture
def closed_client(store, provider, clock, make_settings, db_path):
    return _build(store, provider, clock, make_settings, db_path, demo=False)


def _pay(client, merchant="TEST-comercio-1"):
    response = client.post(LIST_PATH, json={"merchant_id": merchant, "amount_cents": 2500}, headers=PAYER)
    assert response.status_code == 201
    return response.json()["reference"]


def _callback(client, reference, status, event_id, **extra):
    body = {"event_id": event_id, "reference": reference, "status": status, **extra}
    return client.post(EVENTS_PATH, json=body, headers=PROVIDER)


def _simulate(client, reference, status, headers=M1):
    return client.post(f"{LIST_PATH}/{reference}/simulate-event", json={"status": status}, headers=headers)


def _history(client, reference, headers=M1):
    return client.get(f"{LIST_PATH}/{reference}/history", headers=headers)


def _txn_history(client, headers=M1, **params):
    response = client.get(HISTORY_PATH, params=params, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


# --- demo_enabled y filtro status -------------------------------------------------------------------------------

def test_el_listado_informa_demo_enabled_segun_la_configuracion(demo_client, closed_client):
    assert demo_client.get(LIST_PATH, headers=M1).json()["demo_enabled"] is True
    assert closed_client.get(LIST_PATH, headers=M1).json()["demo_enabled"] is False


def test_el_filtro_status_devuelve_solo_los_intentos_en_ese_estado(demo_client):
    paid, waiting = _pay(demo_client), _pay(demo_client)
    assert _callback(demo_client, paid, "SUCCEEDED", "TEST-e1").json() == {"result": "APPLIED"}
    body = demo_client.get(LIST_PATH, params={"status": "succeeded"}, headers=M1).json()
    assert [item["reference"] for item in body["items"]] == [paid]
    body = demo_client.get(LIST_PATH, params={"status": "PENDING"}, headers=M1).json()
    assert [item["reference"] for item in body["items"]] == [waiting]
    assert demo_client.get(LIST_PATH, params={"status": "EXPIRED"}, headers=M1).json()["has_results"] is False


def test_un_status_fuera_del_conjunto_mvp_responde_422(demo_client):
    response = demo_client.get(LIST_PATH, params={"status": "REJECTED"}, headers=M1)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "INVALID_STATUS"


# --- simulate-event ----------------------------------------------------------------------------------------------

def test_simulate_event_esta_cerrado_por_defecto(closed_client):
    reference = _pay(closed_client)
    response = _simulate(closed_client, reference, "SUCCEEDED")
    assert response.status_code == 404
    assert closed_client.get(LIST_PATH, headers=M1).json()["items"][0]["status"] == "PENDING"


def test_simulate_event_aplica_el_evento_por_el_mismo_servicio_del_callback(demo_client, clock):
    reference = _pay(demo_client)
    clock.advance(seconds=3)
    response = _simulate(demo_client, reference, "SUCCEEDED")
    body = response.json()
    assert response.status_code == 200
    assert body["result"] == "APPLIED"
    assert (body["payment"]["reference"], body["payment"]["status"], body["payment"]["status_label"]) == (
        reference, "SUCCEEDED", "Exitoso")
    listed = demo_client.get(LIST_PATH, headers=M1).json()["items"][0]
    assert listed["status"] == "SUCCEEDED"


def test_simulate_event_tambien_respeta_estado_terminal_y_mapeo(demo_client, clock):
    reference = _pay(demo_client)
    clock.advance(seconds=1)
    assert _simulate(demo_client, reference, "REJECTED").json()["payment"]["status"] == "FAILED"
    clock.advance(seconds=1)
    second = _simulate(demo_client, reference, "SUCCEEDED").json()
    assert second["result"] == "ALREADY_TERMINAL"
    assert second["payment"]["status"] == "FAILED"


def test_simulate_event_con_estado_sin_equivalente_no_cambia_nada(demo_client):
    reference = _pay(demo_client)
    body = _simulate(demo_client, reference, "ESTADO_RARO").json()
    assert (body["result"], body["payment"]["status"]) == ("UNMAPPED_STATUS", "PENDING")


@pytest.mark.parametrize("payload", [{}, {"status": ""}, {"status": "con espacio"}, {"status": "X" * 41},
                                     {"status": "SUCCEEDED", "extra": 1}])
def test_simulate_event_valida_el_cuerpo(demo_client, payload):
    reference = _pay(demo_client)
    response = demo_client.post(f"{LIST_PATH}/{reference}/simulate-event", json=payload, headers=M1)
    assert response.status_code == 422


def test_simulate_event_exige_identidad_de_comercio(demo_client):
    reference = _pay(demo_client)
    response = demo_client.post(f"{LIST_PATH}/{reference}/simulate-event", json={"status": "SUCCEEDED"})
    assert response.status_code == 401


def test_simulate_event_no_actua_sobre_intentos_de_otro_comercio(demo_client, clock):
    reference = _pay(demo_client)
    clock.advance(seconds=1)
    foreign = _simulate(demo_client, reference, "SUCCEEDED", headers=M2)
    unknown = _simulate(demo_client, "qr_inexistente", "SUCCEEDED", headers=M1)
    assert foreign.status_code == unknown.status_code == 404
    assert foreign.json() == {"detail": {"code": "QR_PAYMENT_NOT_FOUND",
                                         "message": "No se encontró el pago QR indicado."}}
    assert unknown.json() == foreign.json()
    assert demo_client.get(LIST_PATH, headers=M1).json()["items"][0]["status"] == "PENDING"
    assert _history(demo_client, reference).json()["items"] == []  # ningún evento se registró


# --- criterio 3 de extremo a extremo ------------------------------------------------------------------------------

def test_e2e_callback_real_y_simulado_actualizan_la_vista_y_el_historial(demo_client, clock):
    reference = _pay(demo_client)
    created = demo_client.get(LIST_PATH, headers=M1).json()["items"][0]
    assert created["status"] == "PENDING"

    clock.advance(seconds=2)
    assert _callback(demo_client, reference, "PENDING", "TEST-e1").json() == {"result": "APPLIED"}
    clock.advance(seconds=2)
    assert _callback(demo_client, reference, "SUCCEEDED", "TEST-e2").json() == {"result": "APPLIED"}
    # duplicado: mismo event_id, no altera
    assert _callback(demo_client, reference, "FAILED", "TEST-e2").json() == {"result": "DUPLICATE"}
    # fuera de orden: occurred_at anterior al último aplicado
    late = _callback(demo_client, reference, "FAILED", "TEST-e3", occurred_at="2026-11-06T11:00:00Z")
    assert late.json() == {"result": "OUT_OF_ORDER"}
    # el simulado no puede sobrescribir un terminal
    clock.advance(seconds=1)
    assert _simulate(demo_client, reference, "FAILED").json()["result"] == "ALREADY_TERMINAL"

    listed = demo_client.get(LIST_PATH, headers=M1).json()["items"][0]
    assert listed["status"] == "SUCCEEDED"

    body = _history(demo_client, reference).json()
    assert body["reference"] == reference
    assert body["merchant_id"] == "TEST-comercio-1"
    assert [(item["previous_status"], item["status"], item["status_label"]) for item in body["items"]] == [
        ("PENDING", "PENDING", "En proceso"), ("PENDING", "SUCCEEDED", "Exitoso")]
    first, second = body["items"]
    assert first["occurred_at"] < second["occurred_at"]
    assert set(first) == {"previous_status", "previous_status_label", "status", "status_label", "occurred_at",
                          "received_at"}  # sin carga cruda del proveedor, ni event_id, ni secretos
    assert SECRET not in _history(demo_client, reference).text


def test_e2e_el_evento_simulado_cambia_el_estado_y_queda_en_el_historial(demo_client, clock):
    reference = _pay(demo_client)
    clock.advance(seconds=1)
    assert _simulate(demo_client, reference, "SUCCEEDED").json()["result"] == "APPLIED"
    items = _history(demo_client, reference).json()["items"]
    assert [(item["previous_status"], item["status"]) for item in items] == [("PENDING", "SUCCEEDED")]


def test_el_historial_de_un_intento_sin_cambios_esta_vacio(demo_client):
    reference = _pay(demo_client)
    response = _history(demo_client, reference)
    assert response.status_code == 200
    assert response.json()["items"] == []


def test_el_historial_de_un_intento_no_se_filtra_entre_comercios(demo_client, clock):
    reference = _pay(demo_client)
    clock.advance(seconds=1)
    _callback(demo_client, reference, "SUCCEEDED", "TEST-e1")
    foreign = _history(demo_client, reference, headers=M2)
    unknown = _history(demo_client, "qr_inexistente", headers=M2)
    assert foreign.status_code == unknown.status_code == 404
    assert foreign.json() == unknown.json()
    assert reference not in foreign.text


def test_el_historial_exige_identidad_de_comercio(demo_client):
    assert demo_client.get(f"{LIST_PATH}/qr_1/history").status_code == 401
    assert demo_client.get(HISTORY_PATH).status_code == 401


# --- historial de transacciones del comercio ------------------------------------------------------------------------

def test_historial_del_comercio_una_fila_por_cambio_del_mas_reciente_al_mas_antiguo(demo_client, clock):
    first, other = _pay(demo_client), _pay(demo_client)
    clock.advance(seconds=1)
    _callback(demo_client, first, "PENDING", "TEST-e1")
    clock.advance(seconds=1)
    _callback(demo_client, other, "FAILED", "TEST-e2")
    clock.advance(seconds=1)
    _callback(demo_client, first, "SUCCEEDED", "TEST-e3")
    body = _txn_history(demo_client)
    assert body["merchant_id"] == "TEST-comercio-1"
    assert (body["total"], body["has_results"], body["message"]) == (3, True, None)
    assert [(row["reference"], row["status"]) for row in body["items"]] == [
        (first, "SUCCEEDED"), (other, "FAILED"), (first, "PENDING")]
    assert set(body["items"][0]) == {"reference", "previous_status", "previous_status_label", "status",
                                     "status_label", "occurred_at", "received_at"}


def test_historial_del_comercio_filtra_por_referencia_y_por_fecha_del_evento_combinados(demo_client, clock):
    first, other = _pay(demo_client), _pay(demo_client)
    clock.advance(seconds=1)
    _callback(demo_client, first, "PENDING", "TEST-e1")  # 2026-11-06 (UTC)
    clock.advance(days=1)
    _callback(demo_client, first, "SUCCEEDED", "TEST-e2")  # 2026-11-07
    _callback(demo_client, other, "SUCCEEDED", "TEST-e3")  # 2026-11-07
    by_ref = _txn_history(demo_client, reference=first)
    assert [row["status"] for row in by_ref["items"]] == ["SUCCEEDED", "PENDING"]
    by_day = _txn_history(demo_client, date_from="2026-11-07", date_to="2026-11-07")
    assert by_day["total"] == 2
    combined = _txn_history(demo_client, reference=first, date_from="2026-11-07", date_to="2026-11-07")
    assert [(row["reference"], row["status"]) for row in combined["items"]] == [(first, "SUCCEEDED")]
    only_from = _txn_history(demo_client, date_from="2026-11-07")
    assert only_from["total"] == 2
    only_to = _txn_history(demo_client, date_to="2026-11-06")
    assert [row["status"] for row in only_to["items"]] == ["PENDING"]


def test_historial_del_comercio_sin_resultados_y_rango_invalido(demo_client):
    reference = _pay(demo_client)
    empty = _txn_history(demo_client, reference=reference, date_from="2030-01-01")
    assert (empty["items"], empty["has_results"], empty["total"]) == ([], False, 0)
    assert empty["message"] == "No hay resultados para los filtros aplicados."
    response = demo_client.get(HISTORY_PATH, params={"date_from": "2026-11-08", "date_to": "2026-11-07"},
                               headers=M1)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "INVALID_DATE_RANGE"


def test_historial_del_comercio_pagina(demo_client, clock):
    reference = _pay(demo_client)
    for number in range(3):
        clock.advance(seconds=1)
        _callback(demo_client, reference, "PENDING", f"TEST-e{number}")
    page = _txn_history(demo_client, limit=2, offset=1)
    assert (page["total"], page["limit"], page["offset"], len(page["items"])) == (3, 2, 1, 2)
    assert demo_client.get(HISTORY_PATH, params={"limit": 0}, headers=M1).status_code == 422


def test_historial_del_comercio_no_incluye_eventos_de_otros_comercios(demo_client, clock):
    mine, theirs = _pay(demo_client), _pay(demo_client, merchant="TEST-comercio-2")
    clock.advance(seconds=1)
    _callback(demo_client, mine, "SUCCEEDED", "TEST-e1")
    _callback(demo_client, theirs, "SUCCEEDED", "TEST-e2")
    assert [row["reference"] for row in _txn_history(demo_client)["items"]] == [mine]
    assert [row["reference"] for row in _txn_history(demo_client, headers=M2)["items"]] == [theirs]
    assert _txn_history(demo_client, reference=theirs)["has_results"] is False  # ajena: «sin resultados»


def test_historial_excluye_eventos_que_no_cambiaron_el_estado_visible(demo_client, clock):
    reference = _pay(demo_client)
    clock.advance(seconds=1)
    _callback(demo_client, reference, "ESTADO_RARO", "TEST-e1")
    _callback(demo_client, reference, "SUCCEEDED", "TEST-e2")
    _callback(demo_client, reference, "SUCCEEDED", "TEST-e2")
    _callback(demo_client, reference, "FAILED", "TEST-e3", occurred_at="2026-11-06T11:00:00Z")
    assert [row["status"] for row in _txn_history(demo_client)["items"]] == ["SUCCEEDED"]
