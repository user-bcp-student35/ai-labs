"""Aceptación HTTP de `merchant-qr-payment-status` (escenarios de la spec) con proveedor simulado por callbacks.
El conjunto de estados, el secreto, el plazo y la creación del intento son PROVISIONALES (OQ-08, OQ-24 a OQ-28)."""
import time
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from app.config import MerchantQrSettings
from app.main import create_app

SECRET = "TEST-secreto-proveedor"
PAYER = {"X-Payer-Id": "TEST-payer-1"}
M1 = {"X-Merchant-Id": "TEST-comercio-1"}
M2 = {"X-Merchant-Id": "TEST-comercio-2"}
PROVIDER = {"X-Provider-Secret": SECRET}
LIST_PATH = "/merchant/qr-payments"
EVENTS_PATH = "/provider/qr-events"


@pytest.fixture
def merchant_client(store, provider, clock, make_settings, db_path):
    settings = make_settings(db_path=db_path)
    settings = replace(settings, merchant_qr=replace(settings.merchant_qr, callback_secret=SECRET))
    return TestClient(create_app(settings=settings, provider=provider, store=store, clock=clock))


@pytest.fixture
def pay(merchant_client):
    def _pay(merchant="TEST-comercio-1", amount=2500):
        response = merchant_client.post(LIST_PATH, json={"merchant_id": merchant, "amount_cents": amount},
                                        headers=PAYER)
        assert response.status_code == 201
        return response.json()

    return _pay


@pytest.fixture
def emit(merchant_client):
    counter = {"n": 0}

    def _emit(reference, status, event_id=None, **extra):
        counter["n"] += 1
        body = {"event_id": event_id or f"TEST-evt-{counter['n']}", "reference": reference, "status": status, **extra}
        return merchant_client.post(EVENTS_PATH, json=body, headers=PROVIDER)

    return _emit


def _list(client, headers=M1, **params):
    response = client.get(LIST_PATH, params=params, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_creacion_provisional_del_intento_devuelve_referencia_estado_y_comercio(merchant_client):
    response = merchant_client.post(LIST_PATH, json={"merchant_id": "TEST-comercio-1", "amount_cents": 2500},
                                    headers=PAYER)
    body = response.json()
    assert response.status_code == 201
    assert body["reference"].startswith("qr_")
    assert (body["merchant_id"], body["amount_cents"], body["status"], body["status_label"]) == (
        "TEST-comercio-1", 2500, "PENDING", "En proceso")
    assert body["created_at"] == body["status_updated_at"]


@pytest.mark.parametrize("body", [
    {}, {"merchant_id": "TEST-c1"}, {"amount_cents": 100}, {"merchant_id": "TEST-c1", "amount_cents": 0},
    {"merchant_id": "TEST-c1", "amount_cents": -5}, {"merchant_id": "TEST-c1", "amount_cents": "100"},
    {"merchant_id": "TEST-c1", "amount_cents": 1.5}, {"merchant_id": "TEST-c1", "amount_cents": 10 ** 12},
    {"merchant_id": "con espacio", "amount_cents": 100}, {"merchant_id": "x" * 65, "amount_cents": 100},
    {"merchant_id": "TEST-c1", "amount_cents": 100, "extra": 1}])
def test_creacion_con_cuerpo_invalido_responde_422(merchant_client, body):
    assert merchant_client.post(LIST_PATH, json=body, headers=PAYER).status_code == 422


def test_creacion_exige_identidad_del_pagador(merchant_client):
    response = merchant_client.post(LIST_PATH, json={"merchant_id": "TEST-c1", "amount_cents": 100})
    assert response.status_code == 401


def test_escenario_intento_visible_con_referencia(merchant_client, pay):
    created = pay()
    body = _list(merchant_client)
    assert [item["reference"] for item in body["items"]] == [created["reference"]]
    assert body["items"][0]["status"] == "PENDING"


def test_escenario_referencias_distintas_por_intento(merchant_client, pay):
    pay(), pay()
    references = [item["reference"] for item in _list(merchant_client)["items"]]
    assert len(references) == 2 and len(set(references)) == 2


def test_escenario_aislamiento_entre_comercios(merchant_client, pay):
    mine, other = pay("TEST-comercio-1"), pay("TEST-comercio-2")
    assert [i["reference"] for i in _list(merchant_client, M1)["items"]] == [mine["reference"]]
    assert [i["reference"] for i in _list(merchant_client, M2)["items"]] == [other["reference"]]
    # Consultar por la referencia ajena no la revela
    foreign = _list(merchant_client, M1, reference=other["reference"])
    assert foreign["items"] == [] and foreign["has_results"] is False


def test_la_consulta_exige_identidad_de_comercio(merchant_client):
    assert merchant_client.get(LIST_PATH).status_code == 401
    assert merchant_client.get(LIST_PATH, headers={"X-Merchant-Id": "con espacio"}).status_code == 401
    assert merchant_client.get(LIST_PATH, headers=PAYER).status_code == 401  # el pagador no es un comercio


def test_escenario_estado_actual_visible_exactamente_uno(merchant_client, pay, emit):
    created = pay()
    emit(created["reference"], "SUCCEEDED")
    [item] = _list(merchant_client, reference=created["reference"])["items"]
    assert item["status"] == "SUCCEEDED" and item["status_label"] == "Exitoso"


def test_escenario_estado_fuera_del_conjunto_no_se_muestra_y_se_registra(merchant_client, pay, emit):
    created = pay()
    response = emit(created["reference"], "ESTADO_RARO")
    assert (response.status_code, response.json()) == (200, {"result": "UNMAPPED_STATUS"})
    [item] = _list(merchant_client)["items"]
    assert item["status"] == "PENDING"
    cases = merchant_client.app.state.services.merchant_qr._store.list_review_cases(10)
    assert [(c.reason, c.provider_status) for c in cases] == [("UNMAPPED_STATUS", "ESTADO_RARO")]


def test_escenario_cambio_de_estado_por_callback_y_plazo_de_reflejo(merchant_client, pay, emit):
    created = pay()
    deadline = _list(merchant_client)["reflect_deadline_seconds"]
    assert deadline == 5
    started = time.monotonic()
    assert emit(created["reference"], "REJECTED").json() == {"result": "APPLIED"}
    shown = _list(merchant_client)["items"][0]["status"]
    assert shown == "FAILED"
    assert time.monotonic() - started <= deadline  # el reflejo es inmediato: cabe en el plazo máximo


def test_escenario_evento_duplicado_no_altera_estado_ni_historial(merchant_client, pay, emit):
    created = pay()
    store = merchant_client.app.state.services.merchant_qr._store
    assert emit(created["reference"], "SUCCEEDED", event_id="TEST-evt-dup").json() == {"result": "APPLIED"}
    before = (_list(merchant_client)["items"], store.list_events(created["reference"]))
    assert emit(created["reference"], "SUCCEEDED", event_id="TEST-evt-dup").json() == {"result": "DUPLICATE"}
    assert (_list(merchant_client)["items"], store.list_events(created["reference"])) == before


def test_escenario_evento_fuera_de_orden_no_revierte_el_estado(merchant_client, pay, emit, clock):
    created = pay()
    clock.advance(seconds=10)
    assert emit(created["reference"], "PENDING", occurred_at="2026-11-06T12:00:09Z").status_code == 200
    late = emit(created["reference"], "FAILED", occurred_at="2026-11-06T12:00:05Z")
    assert late.json() == {"result": "OUT_OF_ORDER"}
    assert _list(merchant_client)["items"][0]["status"] == "PENDING"


def test_un_estado_terminal_no_se_revierte_con_eventos_posteriores(merchant_client, pay, emit, clock):
    created = pay()
    emit(created["reference"], "SUCCEEDED")
    clock.advance(seconds=5)
    assert emit(created["reference"], "FAILED").json() == {"result": "ALREADY_TERMINAL"}
    assert _list(merchant_client)["items"][0]["status"] == "SUCCEEDED"


def test_escenario_evento_de_transaccion_desconocida_no_crea_intento_y_se_registra(merchant_client, emit):
    response = emit("qr_inexistente", "SUCCEEDED")
    assert (response.status_code, response.json()) == (200, {"result": "UNKNOWN_REFERENCE"})
    assert _list(merchant_client)["total"] == 0
    cases = merchant_client.app.state.services.merchant_qr._store.list_review_cases(10)
    assert [(c.reason, c.reference) for c in cases] == [("UNKNOWN_REFERENCE", "qr_inexistente")]


def test_evento_sin_secreto_o_con_secreto_incorrecto_se_rechaza_y_no_cambia_nada(merchant_client, pay):
    created = pay()
    body = {"event_id": "TEST-evt-x", "reference": created["reference"], "status": "SUCCEEDED"}
    for headers in ({}, {"X-Provider-Secret": ""}, {"X-Provider-Secret": "otro"}):
        response = merchant_client.post(EVENTS_PATH, json=body, headers=headers)
        assert response.status_code == 401
        assert response.json()["detail"]["code"] == "PROVIDER_SECRET_INVALID"
    assert _list(merchant_client)["items"][0]["status"] == "PENDING"


def test_sin_secreto_configurado_la_recepcion_esta_cerrada(store, provider, clock, make_settings, db_path):
    client = TestClient(create_app(settings=make_settings(db_path=db_path), provider=provider, store=store,
                                   clock=clock))
    body = {"event_id": "TEST-evt-x", "reference": "qr_1", "status": "SUCCEEDED"}
    response = client.post(EVENTS_PATH, json=body, headers={"X-Provider-Secret": ""})
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "PROVIDER_CALLBACK_NOT_CONFIGURED"


@pytest.mark.parametrize("body", [
    {}, {"event_id": "e", "reference": "qr_1"}, {"event_id": "e", "reference": "qr_1", "status": "con espacio"},
    {"event_id": "x" * 65, "reference": "qr_1", "status": "OK"},
    {"event_id": "e", "reference": "qr_1", "status": "S" * 41},
    {"event_id": "e", "reference": "qr_1", "status": "OK", "occurred_at": "no-es-fecha"},
    {"event_id": "e", "reference": "qr_1", "status": "OK", "extra": 1}])
def test_evento_con_cuerpo_invalido_responde_422(merchant_client, body):
    assert merchant_client.post(EVENTS_PATH, json=body, headers=PROVIDER).status_code == 422


def test_escenarios_de_filtro_por_fecha_por_referencia_y_combinados(merchant_client, pay, clock):
    first = pay()
    clock.advance(days=1)
    second = pay()
    clock.advance(days=1)
    third = pay()
    only_second_day = _list(merchant_client, date_from="2026-11-07", date_to="2026-11-07")
    assert [i["reference"] for i in only_second_day["items"]] == [second["reference"]]
    from_second = _list(merchant_client, date_from="2026-11-07")
    assert [i["reference"] for i in from_second["items"]] == [third["reference"], second["reference"]]
    by_reference = _list(merchant_client, reference=first["reference"])
    assert [i["reference"] for i in by_reference["items"]] == [first["reference"]]
    combined = _list(merchant_client, reference=first["reference"], date_from="2026-11-06", date_to="2026-11-06")
    assert [i["reference"] for i in combined["items"]] == [first["reference"]]
    mismatch = _list(merchant_client, reference=first["reference"], date_from="2026-11-07")
    assert mismatch["items"] == []


def test_escenario_sin_resultados_indica_que_no_hay_resultados(merchant_client, pay):
    pay("TEST-comercio-2")
    body = _list(merchant_client)
    assert body["items"] == [] and body["total"] == 0 and body["has_results"] is False
    assert body["message"] == "No hay resultados para los filtros aplicados."


def test_con_resultados_no_hay_mensaje(merchant_client, pay):
    pay()
    body = _list(merchant_client)
    assert body["has_results"] is True and body["message"] is None


@pytest.mark.parametrize("params", [
    {"date_from": "ayer"}, {"date_to": "2026-13-45"}, {"reference": "con espacio"}, {"reference": "x" * 65},
    {"limit": 0}, {"limit": 201}, {"offset": -1}, {"limit": "abc"}])
def test_filtros_invalidos_responden_422(merchant_client, params):
    assert merchant_client.get(LIST_PATH, params=params, headers=M1).status_code == 422


def test_rango_de_fechas_invertido_responde_422_con_codigo(merchant_client):
    response = merchant_client.get(LIST_PATH, params={"date_from": "2026-11-08", "date_to": "2026-11-07"},
                                   headers=M1)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "INVALID_DATE_RANGE"


def test_paginacion(merchant_client, pay):
    for _ in range(3):
        pay()
    page = _list(merchant_client, limit=2, offset=0)
    assert (len(page["items"]), page["total"], page["limit"], page["offset"]) == (2, 3, 2, 0)
    assert len(_list(merchant_client, limit=2, offset=2)["items"]) == 1


def test_un_estado_configurado_sin_etiqueta_muestra_su_codigo(store, provider, clock, make_settings, db_path):
    custom = MerchantQrSettings(callback_secret=SECRET, statuses=("PENDING", "DECLINED"),
                                provider_status_map={"NO": "DECLINED"})
    settings = replace(make_settings(db_path=db_path), merchant_qr=custom)
    client = TestClient(create_app(settings=settings, provider=provider, store=store, clock=clock))
    created = client.post(LIST_PATH, json={"merchant_id": "TEST-comercio-1", "amount_cents": 100}, headers=PAYER).json()
    body = {"event_id": "TEST-evt-1", "reference": created["reference"], "status": "NO"}
    assert client.post(EVENTS_PATH, json=body, headers=PROVIDER).json() == {"result": "APPLIED"}
    [item] = client.get(LIST_PATH, headers=M1).json()["items"]
    assert (item["status"], item["status_label"]) == ("DECLINED", "DECLINED")


def test_flujo_de_extremo_a_extremo_con_proveedor_simulado(merchant_client, pay, emit, clock):
    # Tarea 4.1: creación, cambios de estado, duplicado, fuera de orden, desconocido, filtros y aislamiento.
    paid, failed, waiting = pay(), pay(), pay()
    other = pay("TEST-comercio-2")
    clock.advance(seconds=1)
    assert emit(paid["reference"], "SUCCEEDED", event_id="TEST-evt-e2e-1").json()["result"] == "APPLIED"
    assert emit(paid["reference"], "SUCCEEDED", event_id="TEST-evt-e2e-1").json()["result"] == "DUPLICATE"
    assert emit(failed["reference"], "REJECTED").json()["result"] == "APPLIED"
    assert emit("qr_desconocido", "SUCCEEDED").json()["result"] == "UNKNOWN_REFERENCE"
    assert emit(other["reference"], "SUCCEEDED").json()["result"] == "APPLIED"
    statuses = {i["reference"]: i["status"] for i in _list(merchant_client)["items"]}
    assert statuses == {paid["reference"]: "SUCCEEDED", failed["reference"]: "FAILED",
                        waiting["reference"]: "PENDING"}
    assert other["reference"] not in statuses
    assert _list(merchant_client, reference=paid["reference"])["items"][0]["status"] == "SUCCEEDED"
    assert _list(merchant_client, date_from="2030-01-01")["has_results"] is False
