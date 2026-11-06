"""Aplicación FastAPI y cableado de dependencias."""
from __future__ import annotations

import os
from collections.abc import Callable
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError

from app.config import Settings, load_settings
from app.ports.merchant_qr_store import MerchantQrStorePort
from app.ports.onboarding_store import OnboardingStorePort
from app.ports.payment_provider import PaymentProviderPort
from app.ports.payment_store import PaymentStorePort
from app.repositories.sqlite_merchant_qr_store import SqliteMerchantQrStore
from app.repositories.sqlite_onboarding_store import SqliteOnboardingStore
from app.repositories.sqlite_store import SqliteIdempotencyStore
from app.routes import (
    analytics,
    idempotency_audit,
    merchant_qr,
    onboarding,
    onboarding_analytics,
    payments,
    wallet,
)
from app.routes.error_handlers import register_error_handlers
from app.services.container import build_services
from app.services.flow_config import FlowDefinition, load_flow_definition
from app.services.merchant_qr_service import MerchantQrService
from app.services.onboarding_analytics_service import OnboardingAnalyticsService
from app.services.onboarding_service import OnboardingService
from app.services.wallet_access_service import WalletAccessService


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _onboarding_services(settings: Settings, flow: FlowDefinition | None,
                         onboarding_store: OnboardingStorePort | None,
                         clock: Callable[[], datetime]) -> dict[str, object | None]:
    """Sin flujo configurado no se crea almacén ni archivo: las rutas de onboarding responden 503 (D-9)."""
    config_path = settings.onboarding.steps_config_path
    flow = flow or (load_flow_definition(config_path) if config_path else None)  # inválida: detiene el arranque
    if flow is None:
        return {"onboarding": None, "wallet_access": None, "onboarding_analytics": None}
    onboarding_store = onboarding_store or SqliteOnboardingStore(settings.db_path, clock=clock)
    return {
        "onboarding": OnboardingService(store=onboarding_store, flow=flow, settings=settings, clock=clock),
        "wallet_access": WalletAccessService(store=onboarding_store),
        "onboarding_analytics": OnboardingAnalyticsService(store=onboarding_store, settings=settings),
    }


def create_app(provider: PaymentProviderPort, settings: Settings | None = None,
               store: PaymentStorePort | None = None,
               clock: Callable[[], datetime] = _utc_now, *,
               onboarding_flow: FlowDefinition | None = None,
               onboarding_store: OnboardingStorePort | None = None,
               merchant_qr_store: MerchantQrStorePort | None = None) -> FastAPI:
    settings = settings or load_settings(os.environ)
    store = store or SqliteIdempotencyStore(settings.db_path, clock=clock)
    app = FastAPI(title="Wallet API - pagos de bajo monto, idempotencia y onboarding")
    app.state.settings = settings
    services = build_services(store, provider, settings, clock)
    for name, service in _onboarding_services(settings, onboarding_flow, onboarding_store, clock).items():
        setattr(services, name, service)
    services.merchant_qr = MerchantQrService(
        merchant_qr_store or SqliteMerchantQrStore(settings.db_path, clock=clock), settings.merchant_qr, clock)
    app.state.services = services
    app.add_exception_handler(RequestValidationError, onboarding.sanitized_validation_handler)
    app.include_router(payments.router)
    app.include_router(analytics.router)
    app.include_router(idempotency_audit.router)
    app.include_router(onboarding.router)
    app.include_router(wallet.router)
    app.include_router(onboarding_analytics.router)
    app.include_router(merchant_qr.router)
    register_error_handlers(app)
    return app
