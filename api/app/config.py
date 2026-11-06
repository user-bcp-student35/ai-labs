"""Configuración por variables de entorno. Los valores por defecto de OQ-11, OQ-12 y OQ-13 son propuestas NO aprobadas."""
from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass, field

from app.ports.idempotency_store import STATUS_EXPIRED, STATUS_FAILED, STATUS_PENDING, STATUS_SUCCEEDED

DEFAULT_CHANNEL_KEY = "default"
POLICY_RETURN_ORIGINAL = "return_original"
SUPPORTED_EXPIRED_KEY_POLICIES = (POLICY_RETURN_ORIGINAL,)

# Propuesta no aprobada (OQ-12): ventana de intento de 5 minutos.
DEFAULT_ATTEMPT_WINDOW_SECONDS = 300
# Propuesta no aprobada (OQ-11): retención de claves de 24 h por canal.
DEFAULT_RETENTION_SECONDS = 86400
DEFAULT_WALLET_ID = "wallet-demo"
DEFAULT_DB_PATH = "idempotency.sqlite3"
# Decidida (OQ-17, 2026-11-06): tiempo máximo de un intento de 120 segundos.
DEFAULT_ATTEMPT_TIMEOUT_SECONDS = 120
# Cohorte MVP Perú (OQ-06 decidida: se asigna en el onboarding); mientras no llegue por pagador se usa este valor.
DEFAULT_COHORT = "MVP-PE"  # mismo valor que DEFAULT_ONB_COHORT
# Parámetros de la épica para comparar reportes (caída en checkout y MAU de los meses 1-3).
DEFAULT_CHECKOUT_DROP_BASELINE_PCT = 30.0
DEFAULT_CHECKOUT_DROP_TARGET_PCT = 8.0
DEFAULT_ACTIVE_PAYERS_MIN = 1000
DEFAULT_ACTIVE_PAYERS_MAX = 2000

ENV_ATTEMPT_WINDOW = "IDEM_ATTEMPT_WINDOW_SECONDS"
ENV_RETENTION_BY_CHANNEL = "IDEM_RETENTION_SECONDS_BY_CHANNEL"
ENV_EXPIRED_KEY_POLICY = "IDEM_EXPIRED_KEY_POLICY"
ENV_AUDIT_RETENTION = "IDEM_AUDIT_RETENTION_SECONDS"  # propuesta no aprobada (OQ-13): vacío = sin purga
ENV_WALLET_MOCK_URL = "WALLET_MOCK_URL"
ENV_WALLET_ID = "WALLET_ID"
ENV_DB_PATH = "IDEM_DB_PATH"
ENV_ATTEMPT_TIMEOUT = "PAY_ATTEMPT_TIMEOUT_SECONDS"
ENV_AMOUNT_LIMITS = "PAY_AMOUNT_LIMITS_CENTS_BY_CHANNEL"  # OQ-15 abierta: vacío = sin límite por canal
ENV_COHORT = "PAY_COHORT"
ENV_CONTENT_JSON = "PAY_CONTENT_JSON"

# Onboarding (HU-ONB). Las propuestas marcadas como no aprobadas NO resuelven la pregunta abierta citada.
ENV_ONB_STEPS_CONFIG_PATH = "ONB_STEPS_CONFIG_PATH"  # vacío = onboarding deshabilitado (OQ-19)
ENV_ONB_COHORT = "ONB_COHORT"
ENV_ONB_WALLET_PENDING_STATUS = "ONB_WALLET_PENDING_STATUS"
ENV_ONB_DURATION_START_EVENT = "ONB_DURATION_START_EVENT"
ENV_ONB_DURATION_END_EVENT = "ONB_DURATION_END_EVENT"
ENV_ONB_REPORT_UTC_OFFSET_MINUTES = "ONB_REPORT_UTC_OFFSET_MINUTES"
ENV_ONB_REF_DURATION_BASELINE_MINUTES = "ONB_REF_DURATION_BASELINE_MINUTES"
ENV_ONB_REF_DURATION_TARGET_MINUTES = "ONB_REF_DURATION_TARGET_MINUTES"
ENV_ONB_REF_MAU_MIN = "ONB_REF_MAU_MIN"
ENV_ONB_REF_MAU_MAX = "ONB_REF_MAU_MAX"
ENV_ONB_REF_CAC_TARGET_CENTS = "ONB_REF_CAC_TARGET_CENTS"
ENV_ONB_ANALYTICS_TOKEN = "ONB_ANALYTICS_TOKEN"  # vacío = salida analítica cerrada

# Propuesta no aprobada (OQ-06): cohorte única asignada al iniciar.
DEFAULT_ONB_COHORT = "MVP-PE"
# Propuesta no aprobada (OQ-23): nombre del estado previo a `activo`.
DEFAULT_ONB_WALLET_PENDING_STATUS = "pendiente"
# Propuesta no aprobada (OQ-20): frontera de duración, formato `event_type[:step_id]`.
DEFAULT_ONB_DURATION_START_EVENT = "onboarding_started"
DEFAULT_ONB_DURATION_END_EVENT = "onboarding_closed"
# Supuesto S-2, no aprobado: desfase horario de Lima para los límites mensuales.
DEFAULT_ONB_REPORT_UTC_OFFSET_MINUTES = -300
# Parámetros de referencia de la épica, no resultados garantizados.
DEFAULT_ONB_REF_DURATION_BASELINE_MINUTES = 8
DEFAULT_ONB_REF_DURATION_TARGET_MINUTES = 3
DEFAULT_ONB_REF_MAU_MIN = 1000
DEFAULT_ONB_REF_MAU_MAX = 2000
DEFAULT_ONB_REF_CAC_TARGET_CENTS = 1000


# Estado de pagos QR para comercios (HU-MERCH). TODOS estos valores son PROVISIONALES y NO APROBADOS:
# no resuelven OQ-08, OQ-24, OQ-25, OQ-26, OQ-27 ni OQ-28 (siguen "Abiertas" en docs/OPEN-QUESTIONS.md).
ENV_MERCH_CALLBACK_SECRET = "MERCH_QR_CALLBACK_SECRET"  # vacío = recepción de eventos cerrada (OQ-26)
ENV_MERCH_STATUSES = "MERCH_QR_STATUSES"  # lista separada por comas (OQ-24)
ENV_MERCH_STATUS_MAP = "MERCH_QR_PROVIDER_STATUS_MAP"  # `ESTADO_PROVEEDOR=ESTADO_COMERCIO,...` (OQ-24, OQ-26)
ENV_MERCH_REFLECT_DEADLINE = "MERCH_QR_REFLECT_DEADLINE_SECONDS"  # (OQ-28)
# Provisional y SOLO para entornos locales: habilita `POST .../simulate-event`. Por defecto cerrado (404).
ENV_MERCH_DEMO_ENABLED = "MERCH_QR_DEMO_ENABLED"
ENV_TRUE_VALUE = "true"

# Provisional (OQ-24): los mismos estados del pagador; el inicial de todo intento QR es PENDING.
MERCH_INITIAL_STATUS = STATUS_PENDING
DEFAULT_MERCH_STATUSES = (STATUS_PENDING, STATUS_SUCCEEDED, STATUS_FAILED, STATUS_EXPIRED)
# Provisional (OQ-24, OQ-26): estados del proveedor simulado (`REJECTED`) y los del pagador.
DEFAULT_MERCH_STATUS_MAP = {
    "PENDING": STATUS_PENDING,
    "SUCCEEDED": STATUS_SUCCEEDED,
    "REJECTED": STATUS_FAILED,
    "FAILED": STATUS_FAILED,
    "EXPIRED": STATUS_EXPIRED,
}
# Provisional (OQ-28): plazo máximo entre aplicar un evento y verlo en la vista del comercio.
DEFAULT_MERCH_REFLECT_DEADLINE_SECONDS = 5


def _default_retention() -> dict[str, int]:
    return {DEFAULT_CHANNEL_KEY: DEFAULT_RETENTION_SECONDS}


def _default_merch_status_map() -> dict[str, str]:
    return dict(DEFAULT_MERCH_STATUS_MAP)


@dataclass(frozen=True)
class MerchantQrSettings:
    """Configuración provisional del estado de pagos QR (ver nota superior): nada aquí está aprobado."""

    callback_secret: str = field(default="", repr=False)
    statuses: tuple[str, ...] = DEFAULT_MERCH_STATUSES
    provider_status_map: dict[str, str] = field(default_factory=_default_merch_status_map)
    reflect_deadline_seconds: int = DEFAULT_MERCH_REFLECT_DEADLINE_SECONDS
    demo_enabled: bool = False

    def __post_init__(self) -> None:
        if MERCH_INITIAL_STATUS not in self.statuses:
            raise ValueError("el conjunto de estados del comercio debe incluir el estado inicial")
        if not set(self.provider_status_map.values()) <= set(self.statuses):
            raise ValueError("el mapeo apunta a un estado fuera del conjunto del comercio")
        if self.reflect_deadline_seconds <= 0:
            raise ValueError("el plazo de reflejo debe ser positivo")

    @property
    def terminal_statuses(self) -> frozenset[str]:
        return frozenset(self.statuses) - {MERCH_INITIAL_STATUS}


@dataclass(frozen=True)
class OnboardingSettings:
    steps_config_path: str = ""
    cohort: str = DEFAULT_ONB_COHORT
    wallet_pending_status: str = DEFAULT_ONB_WALLET_PENDING_STATUS
    duration_start_event: str = DEFAULT_ONB_DURATION_START_EVENT
    duration_end_event: str = DEFAULT_ONB_DURATION_END_EVENT
    report_utc_offset_minutes: int = DEFAULT_ONB_REPORT_UTC_OFFSET_MINUTES
    ref_duration_baseline_minutes: int = DEFAULT_ONB_REF_DURATION_BASELINE_MINUTES
    ref_duration_target_minutes: int = DEFAULT_ONB_REF_DURATION_TARGET_MINUTES
    ref_mau_min: int = DEFAULT_ONB_REF_MAU_MIN
    ref_mau_max: int = DEFAULT_ONB_REF_MAU_MAX
    ref_cac_target_cents: int = DEFAULT_ONB_REF_CAC_TARGET_CENTS
    analytics_token: str = field(default="", repr=False)


@dataclass(frozen=True)
class Settings:
    attempt_window_seconds: int = DEFAULT_ATTEMPT_WINDOW_SECONDS
    retention_seconds_by_channel: dict[str, int] = field(default_factory=_default_retention)
    expired_key_policy: str = POLICY_RETURN_ORIGINAL
    audit_retention_seconds: int | None = None
    wallet_mock_url: str = ""
    wallet_id: str = DEFAULT_WALLET_ID
    db_path: str = DEFAULT_DB_PATH
    attempt_timeout_seconds: int = DEFAULT_ATTEMPT_TIMEOUT_SECONDS
    amount_limits_cents_by_channel: dict[str, int] = field(default_factory=dict)
    cohort: str = DEFAULT_COHORT
    content_overrides: dict[str, str] = field(default_factory=dict)
    checkout_drop_baseline_pct: float = DEFAULT_CHECKOUT_DROP_BASELINE_PCT
    checkout_drop_target_pct: float = DEFAULT_CHECKOUT_DROP_TARGET_PCT
    active_payers_min: int = DEFAULT_ACTIVE_PAYERS_MIN
    active_payers_max: int = DEFAULT_ACTIVE_PAYERS_MAX
    onboarding: OnboardingSettings = field(default_factory=OnboardingSettings)
    merchant_qr: MerchantQrSettings = field(default_factory=MerchantQrSettings)

    def __post_init__(self) -> None:
        if self.attempt_window_seconds <= 0:
            raise ValueError("la ventana de intento debe ser positiva")
        if self.expired_key_policy not in SUPPORTED_EXPIRED_KEY_POLICIES:
            raise ValueError("política de clave vencida no soportada")
        if self.attempt_timeout_seconds <= 0:
            raise ValueError("el tiempo máximo del intento debe ser positivo")
        if any(limit <= 0 for limit in self.amount_limits_cents_by_channel.values()):
            raise ValueError("los límites de monto deben ser positivos")

    def retention_for(self, channel: str) -> int | None:
        by_channel = self.retention_seconds_by_channel
        return by_channel.get(channel, by_channel.get(DEFAULT_CHANNEL_KEY))

    def amount_limit_for(self, channel: str) -> int | None:
        by_channel = self.amount_limits_cents_by_channel
        return by_channel.get(channel, by_channel.get(DEFAULT_CHANNEL_KEY))


def _parse_channel_ints(raw: str) -> dict[str, int]:
    parsed: dict[str, int] = {}
    for pair in raw.split(","):
        channel, separator, number = pair.partition("=")
        if not separator or not channel.strip():
            raise ValueError("formato inválido en configuración por canal")
        parsed[channel.strip()] = int(number)
    return parsed


def _parse_status_map(raw: str) -> dict[str, str]:
    parsed: dict[str, str] = {}
    for pair in raw.split(","):
        provider_status, separator, merchant_status = pair.partition("=")
        if not separator or not provider_status.strip() or not merchant_status.strip():
            raise ValueError("formato inválido en el mapeo de estados")
        parsed[provider_status.strip().upper()] = merchant_status.strip().upper()
    return parsed


def _load_merchant_qr_settings(env: Mapping[str, str]) -> MerchantQrSettings:
    defaults = MerchantQrSettings()
    statuses_raw = env.get(ENV_MERCH_STATUSES, "").strip()
    map_raw = env.get(ENV_MERCH_STATUS_MAP, "").strip()
    statuses = tuple(item.strip().upper() for item in statuses_raw.split(",") if item.strip())
    return MerchantQrSettings(
        callback_secret=env.get(ENV_MERCH_CALLBACK_SECRET, ""),
        statuses=statuses or defaults.statuses,
        provider_status_map=_parse_status_map(map_raw) if map_raw else defaults.provider_status_map,
        reflect_deadline_seconds=int(env.get(ENV_MERCH_REFLECT_DEADLINE) or defaults.reflect_deadline_seconds),
        demo_enabled=env.get(ENV_MERCH_DEMO_ENABLED, "").strip().lower() == ENV_TRUE_VALUE,
    )


def _parse_content(raw: str) -> dict[str, str]:
    parsed = json.loads(raw)
    if not isinstance(parsed, dict) or not all(isinstance(value, str) for value in parsed.values()):
        raise ValueError("el contenido configurable debe ser un objeto de textos")
    return parsed


def _load_onboarding_settings(env: Mapping[str, str]) -> OnboardingSettings:
    defaults = OnboardingSettings()

    def number(name: str, default: int) -> int:
        return int(env.get(name) or default)

    return OnboardingSettings(
        steps_config_path=env.get(ENV_ONB_STEPS_CONFIG_PATH, "").strip(),
        cohort=env.get(ENV_ONB_COHORT) or defaults.cohort,
        wallet_pending_status=env.get(ENV_ONB_WALLET_PENDING_STATUS) or defaults.wallet_pending_status,
        duration_start_event=env.get(ENV_ONB_DURATION_START_EVENT) or defaults.duration_start_event,
        duration_end_event=env.get(ENV_ONB_DURATION_END_EVENT) or defaults.duration_end_event,
        report_utc_offset_minutes=number(ENV_ONB_REPORT_UTC_OFFSET_MINUTES, defaults.report_utc_offset_minutes),
        ref_duration_baseline_minutes=number(ENV_ONB_REF_DURATION_BASELINE_MINUTES,
                                             defaults.ref_duration_baseline_minutes),
        ref_duration_target_minutes=number(ENV_ONB_REF_DURATION_TARGET_MINUTES, defaults.ref_duration_target_minutes),
        ref_mau_min=number(ENV_ONB_REF_MAU_MIN, defaults.ref_mau_min),
        ref_mau_max=number(ENV_ONB_REF_MAU_MAX, defaults.ref_mau_max),
        ref_cac_target_cents=number(ENV_ONB_REF_CAC_TARGET_CENTS, defaults.ref_cac_target_cents),
        analytics_token=env.get(ENV_ONB_ANALYTICS_TOKEN, ""),
    )


def load_settings(env: Mapping[str, str]) -> Settings:
    defaults = Settings()
    retention_raw = env.get(ENV_RETENTION_BY_CHANNEL, "").strip()
    audit_raw = env.get(ENV_AUDIT_RETENTION, "").strip()
    limits_raw = env.get(ENV_AMOUNT_LIMITS, "").strip()
    content_raw = env.get(ENV_CONTENT_JSON, "").strip()
    return Settings(
        attempt_window_seconds=int(env.get(ENV_ATTEMPT_WINDOW) or defaults.attempt_window_seconds),
        retention_seconds_by_channel=_parse_channel_ints(retention_raw) if retention_raw else _default_retention(),
        expired_key_policy=env.get(ENV_EXPIRED_KEY_POLICY) or defaults.expired_key_policy,
        audit_retention_seconds=int(audit_raw) if audit_raw else None,
        wallet_mock_url=env.get(ENV_WALLET_MOCK_URL, ""),
        wallet_id=env.get(ENV_WALLET_ID) or defaults.wallet_id,
        db_path=env.get(ENV_DB_PATH) or defaults.db_path,
        attempt_timeout_seconds=int(env.get(ENV_ATTEMPT_TIMEOUT) or defaults.attempt_timeout_seconds),
        amount_limits_cents_by_channel=_parse_channel_ints(limits_raw) if limits_raw else {},
        cohort=env.get(ENV_COHORT) or defaults.cohort,
        content_overrides=_parse_content(content_raw) if content_raw else {},
        onboarding=_load_onboarding_settings(env),
        merchant_qr=_load_merchant_qr_settings(env),
    )
