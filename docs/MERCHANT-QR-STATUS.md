# Estado de pagos QR para comercios (MERCH) — modelo, estados y consulta

> **Estado: PROVISIONAL.** Todo lo marcado como provisional se implementó con valores configurables para poder avanzar, pero **no está aprobado**: OQ-08, OQ-24, OQ-25, OQ-26, OQ-27 y OQ-28 siguen **Abiertas** en [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md). Cambiar un valor no exige cambiar código.

Enlaces: historia [merchant-qr-payment-status-visibility](stories/merchant-qr-payment-status-visibility.sp.md), épica [peru-wallet-mvp](epic/peru-wallet-mvp.sp.md), cambio OpenSpec [merchant-qr-payment-status-visibility](../openspec/changes/merchant-qr-payment-status-visibility/) (spec `merchant-qr-payment-status`).

## 1. Modelo (tareas 1.1 y 1.3)

| Tabla (SQLite, mismo archivo `IDEM_DB_PATH`) | Contenido |
|---|---|
| `merchant_qr_attempts` | Un intento QR: `reference` (clave primaria, única), `merchant_id` (un solo comercio), `payer_id`, `amount_cents`, `status` visible, `created_at`, `status_updated_at` (momento del último evento aplicado; al crear, la creación). |
| `merchant_qr_events` | Historial **append-only** (triggers que impiden UPDATE/DELETE) de eventos del proveedor: `event_id`, `provider_status`, `merchant_status` (nulo si no hay equivalente), `occurred_at`, `received_at`, `applied`. `UNIQUE(reference, event_id)` deduplica. |
| `merchant_qr_review_cases` | Registro **append-only** para revisión operativa: `UNKNOWN_REFERENCE` y `UNMAPPED_STATUS`. `UNIQUE(reason, reference, event_id)` evita multiplicar reintentos. |

- La referencia es `qr_` + UUID aleatorio de 32 hex; dos intentos nunca la comparten (clave primaria + generación aleatoria).
- El estado visible es una **proyección** del historial: se actualiza en la misma transacción (`BEGIN IMMEDIATE`) que agrega el evento, con la regla de la sección 3.
- Las tablas se crean en el primer uso, no al arrancar.

## 2. Mapeo de estados (tarea 1.2) — provisional (OQ-24, OQ-26)

Conjunto del comercio **provisional**: `PENDING`, `SUCCEEDED`, `FAILED`, `EXPIRED` (los mismos del pagador; etiquetas «En proceso», «Exitoso», «Fallido», «Expirado» reutilizadas del pagador). Todo intento nace `PENDING`; los demás se consideran terminales.

Mapeo por defecto del estado del proveedor al del comercio (insensible a mayúsculas): `PENDING→PENDING`, `SUCCEEDED→SUCCEEDED`, `REJECTED→FAILED`, `FAILED→FAILED`, `EXPIRED→EXPIRED`.

Un estado del proveedor **sin equivalente** nunca se muestra tal cual: el intento conserva su estado, el evento queda en el historial con `merchant_status` nulo y se registra un caso `UNMAPPED_STATUS`. Qué mostrar en su lugar sigue pendiente (OQ-24).

## 3. Eventos del proveedor (tareas 2.1 a 2.4) — provisional (OQ-26)

`POST /provider/qr-events` valida el origen con un **secreto compartido** en el header `X-Provider-Secret` (comparación en tiempo constante). Sin secreto configurado la recepción está cerrada (503); con secreto ausente o incorrecto, 401 y no cambia nada. El método real de autenticación depende del proveedor (OQ-26).

Resultado de aplicar un evento (siempre HTTP 200 si está autenticado y bien formado, para que el proveedor no reintente indefinidamente):

| `result` | Significado |
|---|---|
| `APPLIED` | Cambió el estado visible y quedó en el historial. |
| `DUPLICATE` | Mismo `event_id` para la misma referencia: no altera estado ni historial. |
| `OUT_OF_ORDER` | `occurred_at` anterior al último evento aplicado: se guarda en el historial (`applied=0`), no revierte el estado. |
| `ALREADY_TERMINAL` | El intento ya está en un estado terminal: no se sobrescribe. |
| `UNMAPPED_STATUS` | Estado del proveedor sin equivalente: ver sección 2. |
| `UNKNOWN_REFERENCE` | No existe el intento: no se crea nada visible; queda un caso `UNKNOWN_REFERENCE`. |

`occurred_at` es opcional; si falta o es futura se usa el momento de recepción (un reloj adelantado del proveedor no bloquea eventos siguientes). Esta deduplicación es distinta de la idempotencia de pagos (`payment-idempotency`).

## 4. Consulta del comercio (tareas 3.1 a 3.4)

`GET /merchant/qr-payments` (header `X-Merchant-Id`, identidad provisional equivalente a `X-Payer-Id`) devuelve **solo** los intentos del comercio autenticado, del más reciente al más antiguo.

| Filtro (query) | Regla |
|---|---|
| `reference` | Referencia exacta (≤ 64, `A-Za-z0-9._:-`). Una referencia de otro comercio devuelve «sin resultados». |
| `date_from`, `date_to` | `YYYY-MM-DD`, ambos inclusivos; filtran por **fecha UTC de creación del intento** (provisional, OQ-27). Se puede pasar uno solo, o el mismo día en ambos para una fecha. Si `date_from > date_to` → 422 `INVALID_DATE_RANGE`. |
| `status` | Opcional, insensible a mayúsculas; debe pertenecer al conjunto MVP configurado (`MERCH_QR_STATUSES`), si no → 422 `INVALID_STATUS`. Filtra por el estado **actual**. |
| `limit`, `offset` | Paginación; `limit` 1–200 (por defecto 50). |

Los filtros se combinan con AND. Si nada cumple: `has_results=false`, `items=[]` y `message="No hay resultados para los filtros aplicados."`, sin transacciones de otros comercios.

La respuesta incluye además `demo_enabled` (booleano, ver sección 8): la web lo usa para decidir si muestra los controles de simulación.

**Plazo de reflejo (OQ-28, provisional 5 s):** la consulta lee el estado ya proyectado, así que un evento aplicado se ve en la siguiente consulta. El canal no está decidido (OQ-25), por lo que no hay push: el cliente consulta periódicamente y la respuesta incluye `reflect_deadline_seconds` como intervalo máximo sugerido. Cada ítem trae `status_updated_at` (última actualización).

## 4 bis. Historial de cambios de estado (criterio 4) — provisional (OQ-27)

**Decisión provisional sobre el filtro de fecha:** el listado de la sección 4 filtra por la fecha **del intento** (creación). El criterio 4 pide filtrar el **historial de estados** por fecha y referencia, así que existe un historial aparte cuyo filtro de fecha es la fecha **del evento** (`occurred_at`, UTC, ambos extremos inclusivos). Ambos usan el mismo formato de fechas y la misma validación; ninguno impone retención ni rango máximo.

**Qué es un «cambio de estado»:** un evento **aplicado** (`applied=1`): cambió el estado visible o lo confirmó (p. ej. `PENDING→PENDING`). No aparecen duplicados, fuera de orden, posteriores a un estado terminal, estados sin equivalente ni referencias desconocidas. Cada fila trae `previous_status` (el estado visible justo antes; `PENDING` para el primer cambio) y `status`, con sus etiquetas, `occurred_at` y `received_at`. **No** se exponen `event_id`, estado crudo del proveedor ni secretos. El estado anterior no depende del rango de fechas pedido.

| Endpoint | Detalle |
|---|---|
| `GET /merchant/qr-payments/{reference}/history` | Header `X-Merchant-Id`. Cambios del intento en orden **cronológico** (puede estar vacío si no hubo cambios). 404 `QR_PAYMENT_NOT_FOUND` si la referencia no existe o es de otro comercio (misma respuesta en ambos casos). |
| `GET /merchant/qr-payments/history?reference=&date_from=&date_to=&limit=&offset=` | Header `X-Merchant-Id`. Una fila por cambio de estado de **todos** los intentos del comercio, del más reciente al más antiguo, con `reference`. Filtros combinados con AND; `has_results`, `message` y `total` como en el listado; 422 `INVALID_DATE_RANGE`. Una referencia ajena da «sin resultados». |

## 5. Creación del intento (OQ-08) — provisional

`POST /merchant/qr-payments` (header `X-Payer-Id`) crea un intento QR hacia un comercio solo para poder probar y demostrar el flujo. No define el flujo real de creación; no valida que el comercio exista.

## 6. Configuración (todas provisionales)

| Variable | Defecto | Pregunta |
|---|---|---|
| `MERCH_QR_CALLBACK_SECRET` | vacío (recepción cerrada) | OQ-26 |
| `MERCH_QR_STATUSES` | `PENDING,SUCCEEDED,FAILED,EXPIRED` | OQ-24 |
| `MERCH_QR_PROVIDER_STATUS_MAP` | `PENDING=PENDING,SUCCEEDED=SUCCEEDED,REJECTED=FAILED,FAILED=FAILED,EXPIRED=EXPIRED` | OQ-24, OQ-26 |
| `MERCH_QR_REFLECT_DEADLINE_SECONDS` | `5` | OQ-28 |
| `MERCH_QR_DEMO_ENABLED` | `false` (solo `true` la activa) | OQ-25, OQ-26 |

## 8. Simulación de eventos para demostración — provisional, solo entornos locales

`POST /merchant/qr-payments/{reference}/simulate-event` (headers `X-Merchant-Id` y `Content-Type: application/json`, cuerpo `{"status": "SUCCEEDED"}`) aplica un evento del proveedor **sin que el navegador conozca `MERCH_QR_CALLBACK_SECRET`**. Usa el **mismo servicio** que `POST /provider/qr-events` (mismo mapeo, orden, estados terminales y deduplicación; el `event_id` se genera único con prefijo `sim-`, sin `occurred_at`: se usa la hora de recepción). Respuesta 200: `{"result": "APPLIED", "payment": {...}}` con los mismos valores de `result` de la sección 3 y el intento ya actualizado.

- Solo existe con `MERCH_QR_DEMO_ENABLED=true`; por defecto responde **404** (como si no existiera). `GET /merchant/qr-payments` informa `demo_enabled`.
- Intento inexistente o de otro comercio → 404 `QR_PAYMENT_NOT_FOUND`, sin registrar nada.
- **No usar fuera de local**: no es un flujo del producto ni resuelve OQ-25/OQ-26 (siguen abiertas); debe retirarse o dejarse apagado al definir el canal real.

Sin retención ni rango máximo de fechas implementados (OQ-27 abierta).
