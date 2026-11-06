"""Configuración PROVISIONAL del estado de pagos QR del comercio (OQ-08, OQ-24 a OQ-28 siguen abiertas)."""
import pytest

from app.config import (
    DEFAULT_MERCH_REFLECT_DEADLINE_SECONDS,
    DEFAULT_MERCH_STATUSES,
    MerchantQrSettings,
    load_settings,
)


def test_los_valores_por_defecto_son_los_provisionales():
    settings = MerchantQrSettings()
    assert settings.statuses == ("PENDING", "SUCCEEDED", "FAILED", "EXPIRED") == DEFAULT_MERCH_STATUSES
    assert settings.reflect_deadline_seconds == DEFAULT_MERCH_REFLECT_DEADLINE_SECONDS == 5
    assert settings.callback_secret == ""  # cerrado por defecto
    assert settings.provider_status_map["REJECTED"] == "FAILED"
    assert settings.terminal_statuses == {"SUCCEEDED", "FAILED", "EXPIRED"}


def test_el_secreto_no_aparece_en_la_representacion():
    assert "TEST-secreto" not in repr(MerchantQrSettings(callback_secret="TEST-secreto"))


def test_load_settings_sin_variables_usa_los_valores_provisionales():
    assert load_settings({}).merchant_qr == MerchantQrSettings()


def test_load_settings_lee_las_variables_de_entorno():
    env = {
        "MERCH_QR_CALLBACK_SECRET": "TEST-secreto",
        "MERCH_QR_STATUSES": "pending, succeeded, declined",
        "MERCH_QR_PROVIDER_STATUS_MAP": "ok=succeeded, no=declined, wait=pending",
        "MERCH_QR_REFLECT_DEADLINE_SECONDS": "12",
    }
    merchant_qr = load_settings(env).merchant_qr
    assert merchant_qr.callback_secret == "TEST-secreto"
    assert merchant_qr.statuses == ("PENDING", "SUCCEEDED", "DECLINED")
    assert merchant_qr.provider_status_map == {"OK": "SUCCEEDED", "NO": "DECLINED", "WAIT": "PENDING"}
    assert merchant_qr.reflect_deadline_seconds == 12
    assert merchant_qr.demo_enabled is False


def test_la_demostracion_esta_cerrada_por_defecto_y_solo_se_abre_con_true():
    assert MerchantQrSettings().demo_enabled is False
    assert load_settings({"MERCH_QR_DEMO_ENABLED": "TRUE"}).merchant_qr.demo_enabled is True
    for raw in ("", "false", "1", "yes"):
        assert load_settings({"MERCH_QR_DEMO_ENABLED": raw}).merchant_qr.demo_enabled is False


@pytest.mark.parametrize("raw", ["SOLO_CLAVE", "A=", "=B", "A=B,C"])
def test_un_mapeo_mal_formado_es_invalido(raw):
    with pytest.raises(ValueError):
        load_settings({"MERCH_QR_PROVIDER_STATUS_MAP": raw})


def test_un_mapeo_a_un_estado_fuera_del_conjunto_es_invalido():
    with pytest.raises(ValueError):
        MerchantQrSettings(provider_status_map={"OK": "DESCONOCIDO"})


def test_el_conjunto_debe_incluir_el_estado_inicial():
    with pytest.raises(ValueError):
        MerchantQrSettings(statuses=("SUCCEEDED",), provider_status_map={})


@pytest.mark.parametrize("seconds", [0, -1])
def test_el_plazo_de_reflejo_debe_ser_positivo(seconds):
    with pytest.raises(ValueError):
        MerchantQrSettings(reflect_deadline_seconds=seconds)
