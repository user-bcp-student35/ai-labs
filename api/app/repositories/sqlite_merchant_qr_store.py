"""Almacén SQLite del puerto MerchantQrStorePort. Consultas parametrizadas; una conexión y una transacción por
operación. El esquema se crea en el primer uso (no al construir) para no tocar el archivo si nadie usa la función."""
from __future__ import annotations

import sqlite3
import threading
from collections.abc import Callable
from contextlib import AbstractContextManager
from datetime import datetime, timezone

from app.ports.merchant_qr_store import (
    OUTCOME_APPLIED,
    OUTCOME_DUPLICATE,
    OUTCOME_UNKNOWN_REFERENCE,
    OUTCOME_UNMAPPED_STATUS,
    REVIEW_REASONS,
    REVIEW_UNKNOWN_REFERENCE,
    REVIEW_UNMAPPED_STATUS,
    AttemptPage,
    AttemptQuery,
    OutcomeDecider,
    ProviderEvent,
    QrAttempt,
    ReviewCase,
    StatusChange,
    StatusChangePage,
    StatusChangeQuery,
    StoredEvent,
)
from app.repositories.sqlite_support import connection, initialize_schema, to_datetime, to_text

_REVIEW_REASON_LIST = ", ".join(f"'{reason}'" for reason in REVIEW_REASONS)

SCHEMA = f"""
CREATE TABLE IF NOT EXISTS merchant_qr_attempts (
    reference TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL,
    payer_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    status_updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_merchant_qr_attempts_merchant ON merchant_qr_attempts(merchant_id, created_at);

CREATE TABLE IF NOT EXISTS merchant_qr_events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL REFERENCES merchant_qr_attempts(reference),
    event_id TEXT NOT NULL,
    provider_status TEXT NOT NULL,
    merchant_status TEXT,
    occurred_at TEXT NOT NULL,
    received_at TEXT NOT NULL,
    applied INTEGER NOT NULL CHECK (applied IN (0, 1)),
    UNIQUE (reference, event_id)
);
CREATE TRIGGER IF NOT EXISTS merchant_qr_events_no_update BEFORE UPDATE ON merchant_qr_events
BEGIN SELECT RAISE(ABORT, 'merchant_qr_events es append-only'); END;
CREATE TRIGGER IF NOT EXISTS merchant_qr_events_no_delete BEFORE DELETE ON merchant_qr_events
BEGIN SELECT RAISE(ABORT, 'merchant_qr_events es append-only'); END;

CREATE TABLE IF NOT EXISTS merchant_qr_review_cases (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    reason TEXT NOT NULL CHECK (reason IN ({_REVIEW_REASON_LIST})),
    reference TEXT NOT NULL,
    event_id TEXT NOT NULL,
    provider_status TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    UNIQUE (reason, reference, event_id)
);
CREATE TRIGGER IF NOT EXISTS merchant_qr_review_no_update BEFORE UPDATE ON merchant_qr_review_cases
BEGIN SELECT RAISE(ABORT, 'merchant_qr_review_cases es append-only'); END;
CREATE TRIGGER IF NOT EXISTS merchant_qr_review_no_delete BEFORE DELETE ON merchant_qr_review_cases
BEGIN SELECT RAISE(ABORT, 'merchant_qr_review_cases es append-only'); END;
"""

# Los intentos más recientes primero; `reference` desempata para que la paginación sea estable.
_ORDER_AND_PAGE = " ORDER BY created_at DESC, reference DESC LIMIT ? OFFSET ?"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _attempt_from_row(row: sqlite3.Row) -> QrAttempt:
    return QrAttempt(
        reference=row["reference"], merchant_id=row["merchant_id"], payer_id=row["payer_id"],
        amount_cents=row["amount_cents"], status=row["status"], created_at=to_datetime(row["created_at"]),
        status_updated_at=to_datetime(row["status_updated_at"]))


def _stored_event_from_row(row: sqlite3.Row) -> StoredEvent:
    return StoredEvent(event_id=row["event_id"], provider_status=row["provider_status"],
                       merchant_status=row["merchant_status"], occurred_at=to_datetime(row["occurred_at"]),
                       applied=bool(row["applied"]))


def _review_from_row(row: sqlite3.Row) -> ReviewCase:
    return ReviewCase(reason=row["reason"], reference=row["reference"], event_id=row["event_id"],
                      provider_status=row["provider_status"], recorded_at=to_datetime(row["recorded_at"]))


def _search_clauses(query: AttemptQuery) -> tuple[str, list[object]]:
    """Fragmentos de SQL fijos (sin texto del usuario) y sus parámetros; el comercio siempre filtra."""
    clauses, params = ["merchant_id = ?"], [query.merchant_id]
    if query.reference is not None:
        clauses.append("reference = ?")
        params.append(query.reference)
    if query.created_from is not None:
        clauses.append("created_at >= ?")
        params.append(to_text(query.created_from))
    if query.created_before is not None:
        clauses.append("created_at < ?")
        params.append(to_text(query.created_before))
    if query.status is not None:
        clauses.append("status = ?")
        params.append(query.status)
    return " AND ".join(clauses), params


def _change_filters(query: StatusChangeQuery) -> tuple[str, list[object]]:
    """Filtros sobre el historial ya con el estado anterior calculado (fragmentos fijos, valores parametrizados)."""
    clauses, params = ["1 = 1"], []
    if query.reference is not None:
        clauses.append("reference = ?")
        params.append(query.reference)
    if query.occurred_from is not None:
        clauses.append("occurred_at >= ?")
        params.append(to_text(query.occurred_from))
    if query.occurred_before is not None:
        clauses.append("occurred_at < ?")
        params.append(to_text(query.occurred_before))
    return " AND ".join(clauses), params


def _change_from_row(row: sqlite3.Row) -> StatusChange:
    return StatusChange(reference=row["reference"], previous_status=row["previous_status"], status=row["status"],
                        occurred_at=to_datetime(row["occurred_at"]), received_at=to_datetime(row["received_at"]))


# Solo eventos aplicados, del comercio indicado; LAG obtiene el estado visible previo dentro de cada intento. Los
# filtros de fecha se aplican DESPUÉS, para que el estado anterior no dependa del rango pedido.
_CHANGES_CTE = """
WITH changes AS (
    SELECT e.seq, e.reference, e.merchant_status AS status, e.occurred_at, e.received_at,
           LAG(e.merchant_status, 1, ?) OVER (PARTITION BY e.reference ORDER BY e.seq) AS previous_status
    FROM merchant_qr_events e JOIN merchant_qr_attempts a ON a.reference = e.reference
    WHERE a.merchant_id = ? AND e.applied = 1
)
"""
_NEWEST_FIRST = " ORDER BY occurred_at DESC, seq DESC LIMIT ? OFFSET ?"
_OLDEST_FIRST = " ORDER BY occurred_at ASC, seq ASC LIMIT ? OFFSET ?"


class SqliteMerchantQrStore:
    def __init__(self, db_path: str, clock: Callable[[], datetime] = _utc_now) -> None:
        self._db_path = db_path
        self._clock = clock
        self._schema_ready = False
        self._schema_lock = threading.Lock()

    def _connection(self) -> AbstractContextManager[sqlite3.Connection]:
        self._ensure_schema()
        return connection(self._db_path)

    def _ensure_schema(self) -> None:
        if self._schema_ready:
            return
        with self._schema_lock:
            if not self._schema_ready:
                initialize_schema(self._db_path, SCHEMA)
                self._schema_ready = True

    def create_attempt(self, attempt: QrAttempt) -> QrAttempt:
        with self._connection() as con:
            con.execute(
                "INSERT INTO merchant_qr_attempts (reference, merchant_id, payer_id, amount_cents, status,"
                " created_at, status_updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (attempt.reference, attempt.merchant_id, attempt.payer_id, attempt.amount_cents, attempt.status,
                 to_text(attempt.created_at), to_text(attempt.status_updated_at)))
        return attempt

    def apply_event(self, event: ProviderEvent, decide: OutcomeDecider) -> str:
        received_at = to_text(self._clock())
        with self._connection() as con:
            con.execute("BEGIN IMMEDIATE")  # bloqueo de escritura antes de leer: lectura y decisión atómicas
            row = con.execute("SELECT * FROM merchant_qr_attempts WHERE reference = ?",
                              (event.reference,)).fetchone()
            if row is None:
                self._insert_review(con, REVIEW_UNKNOWN_REFERENCE, event, received_at)
                return OUTCOME_UNKNOWN_REFERENCE
            if self._event_exists(con, event):
                return OUTCOME_DUPLICATE
            outcome = decide(_attempt_from_row(row))
            self._insert_event(con, event, received_at, applied=outcome == OUTCOME_APPLIED)
            if outcome == OUTCOME_APPLIED:
                con.execute("UPDATE merchant_qr_attempts SET status = ?, status_updated_at = ? WHERE reference = ?",
                            (event.merchant_status, to_text(event.occurred_at), event.reference))
            if outcome == OUTCOME_UNMAPPED_STATUS:
                self._insert_review(con, REVIEW_UNMAPPED_STATUS, event, received_at)
            return outcome

    @staticmethod
    def _event_exists(con: sqlite3.Connection, event: ProviderEvent) -> bool:
        row = con.execute("SELECT 1 FROM merchant_qr_events WHERE reference = ? AND event_id = ?",
                          (event.reference, event.event_id)).fetchone()
        return row is not None

    @staticmethod
    def _insert_event(con: sqlite3.Connection, event: ProviderEvent, received_at: str, applied: bool) -> None:
        con.execute(
            "INSERT INTO merchant_qr_events (reference, event_id, provider_status, merchant_status, occurred_at,"
            " received_at, applied) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (event.reference, event.event_id, event.provider_status, event.merchant_status,
             to_text(event.occurred_at), received_at, int(applied)))

    @staticmethod
    def _insert_review(con: sqlite3.Connection, reason: str, event: ProviderEvent, recorded_at: str) -> None:
        # UNIQUE + OR IGNORE: los reintentos del proveedor no multiplican el mismo caso.
        con.execute(
            "INSERT OR IGNORE INTO merchant_qr_review_cases (reason, reference, event_id, provider_status,"
            " recorded_at) VALUES (?, ?, ?, ?, ?)",
            (reason, event.reference, event.event_id, event.provider_status, recorded_at))

    def search_attempts(self, query: AttemptQuery) -> AttemptPage:
        where, params = _search_clauses(query)
        with self._connection() as con:
            total = con.execute(f"SELECT COUNT(*) FROM merchant_qr_attempts WHERE {where}", params).fetchone()[0]
            rows = con.execute(f"SELECT * FROM merchant_qr_attempts WHERE {where}{_ORDER_AND_PAGE}",
                               [*params, query.limit, query.offset]).fetchall()
        return AttemptPage(items=[_attempt_from_row(row) for row in rows], total=total)

    def search_status_changes(self, query: StatusChangeQuery) -> StatusChangePage:
        where, params = _change_filters(query)
        order = _NEWEST_FIRST if query.newest_first else _OLDEST_FIRST
        base = [query.initial_status, query.merchant_id]
        with self._connection() as con:
            total = con.execute(f"{_CHANGES_CTE} SELECT COUNT(*) FROM changes WHERE {where}",
                                [*base, *params]).fetchone()[0]
            rows = con.execute(f"{_CHANGES_CTE} SELECT * FROM changes WHERE {where}{order}",
                               [*base, *params, query.limit, query.offset]).fetchall()
        return StatusChangePage(items=[_change_from_row(row) for row in rows], total=total)

    def list_events(self, reference: str) -> list[StoredEvent]:
        with self._connection() as con:
            rows = con.execute("SELECT * FROM merchant_qr_events WHERE reference = ? ORDER BY seq",
                               (reference,)).fetchall()
        return [_stored_event_from_row(row) for row in rows]

    def list_review_cases(self, limit: int) -> list[ReviewCase]:
        with self._connection() as con:
            rows = con.execute("SELECT * FROM merchant_qr_review_cases ORDER BY seq LIMIT ?", (limit,)).fetchall()
        return [_review_from_row(row) for row in rows]
