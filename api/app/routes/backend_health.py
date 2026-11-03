import logging
import os

import urllib3
from fastapi import APIRouter, Depends

from app.config import (
    BACKEND_HEALTH_ERROR_BODY,
    BACKEND_HEALTH_TIMEOUT_SECONDS,
    DEFAULT_BACKEND_HEALTH_URL,
)
from app.schemas import BackendHealthOut
from app.security import legacy_identity

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/api/backend-health", response_model=BackendHealthOut)
def backend_health(
    identity: dict[str, str] = Depends(legacy_identity),
) -> BackendHealthOut:
    url = os.getenv("AUTH_HEALTH_URL", DEFAULT_BACKEND_HEALTH_URL)
    try:
        response = urllib3.PoolManager().request(
            "GET",
            url,
            timeout=BACKEND_HEALTH_TIMEOUT_SECONDS,
        )
        body = response.data.decode("utf-8")
    except (urllib3.exceptions.HTTPError, UnicodeDecodeError) as error:
        logger.warning("Backend health request failed (%s)", type(error).__name__)
        return BackendHealthOut(
            requested_by=identity["username"],
            status=0,
            body=BACKEND_HEALTH_ERROR_BODY,
        )
    return BackendHealthOut(
        requested_by=identity["username"],
        status=response.status,
        body=body,
    )
