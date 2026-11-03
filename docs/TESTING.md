# Evidencia de pruebas

## Alcance

Componente: **api**. Esta matriz se basa en el contrato observado y los
riesgos pendientes descritos en [ENDPOINTS.md](./ENDPOINTS.md), y en la suite
ejecutable [test_api.py](../api/tests/test_api.py). Los resultados siguientes
corresponden a la ejecución registrada en esta sesión; las pruebas propuestas
no se presentan como ejecutadas.

Las rutas cubiertas son `api/app/routes/tasks.py:13`,
`api/app/routes/tasks.py:21`, `api/app/routes/summary.py:13`,
`api/app/routes/uploads.py:11` y `api/app/routes/backend_health.py:19`.
Los modelos request/response están en `api/app/schemas.py:6`,
`api/app/schemas.py:15`, `api/app/schemas.py:27`, `api/app/schemas.py:36` y
`api/app/schemas.py:45`; la dependencia de identidad compartida está en
`api/app/security.py:14`.

## Matriz por endpoint

| Endpoint | Caso | Tipo | Resultado esperado |
|---|---|---|---|
| `GET /api/tasks` | Listar tareas sembradas del usuario; `test_lists_seeded_tasks` (`api/tests/test_api.py:27`), ejecutada | Camino feliz | `200`; lista de tareas del owner autenticado. |
| `GET /api/tasks` | Solicitar `?owner=trainer`; `test_owner_query_is_ignored_and_token_identity_is_used` (`api/tests/test_api.py:85`), ejecutada | Borde / autorización | `200`; se ignora `owner` y se devuelven únicamente tareas del token (`student`), sin la tarea de `trainer`. |
| `GET /api/tasks` | Token inválido; `test_rejects_invalid_token` (`api/tests/test_api.py:78`) y `test_invalid_token_response_has_generic_detail` (`api/tests/test_api.py:183`), ejecutadas | Error documentado | `401` y `{"detail":"Invalid token"}`. |
| `POST /api/tasks` | Crear tarea válida; `test_creates_task_and_summary` (`api/tests/test_api.py:35`), ejecutada | Camino feliz | `201`; `TaskOut` con `id`, `title`, `description`, `status`, `owner`, `priority` y `createdAt`. |
| `POST /api/tasks` | Defaults y texto con apóstrofe; `test_create_task_uses_existing_defaults` (`api/tests/test_api.py:133`) y `test_task_title_with_apostrophe_round_trips` (`api/tests/test_api.py:111`), ejecutadas | Borde | `201`; defaults `TODO`/`MEDIUM` y título recuperado sin alteración. El payload completamente vacío `{}` queda pendiente. |
| `POST /api/tasks` | Body ausente; `test_missing_task_body_returns_validation_error` (`api/tests/test_api.py:170`), ejecutada | Error documentado | `422` de validación. |
| `POST /api/tasks` | Token inválido (`api/app/security.py:24`) y fallo al recuperar la fila creada (`api/app/repositories/tasks.py:99`) | Error documentado | Respectivamente `401` con `{"detail":"Invalid token"}` y `500` de Starlette (`Internal Server Error`). No hay prueba específica de esta ruta para esos casos. |
| `GET /api/summary` | Conteo total, por estado y prioridad alta abierta; `test_summary_counts_statuses_and_high_priority_open` (`api/tests/test_api.py:147`), ejecutada | Camino feliz | `200`; `owner`, `total`, `byStatus` y `highPriorityOpen` corresponden a las tareas del token. |
| `GET /api/summary` | Owner de query distinto; `test_owner_query_is_ignored_and_token_identity_is_used` (`api/tests/test_api.py:85`), ejecutada | Borde / autorización | `200`; se ignora `owner=trainer` y el resumen corresponde a `student`. Resumen sin tareas todavía no probado. |
| `GET /api/summary` | Token inválido | Error documentado | `401` y `{"detail":"Invalid token"}`. No hay prueba específica para esta ruta. |
| `POST /api/requirements` | Subir archivo con extensión y contenido; `test_uploads_requirement` (`api/tests/test_api.py:64`), ejecutada | Camino feliz | `201`; respuesta con `owner`, `fileName`, `storedAt` y `size`; archivo presente en el directorio de carga. |
| `POST /api/requirements` | Archivo vacío, sin extensión y límite de tamaño (`api/app/routes/uploads.py:18`) | Borde | Pendiente. El código no define extensión permitida ni tamaño máximo; no se inventa una política ni se afirma que la falta de controles sea el resultado deseado. |
| `POST /api/requirements` | Token inválido (`api/app/security.py:24`); falta el campo `file`; fallo de escritura (`api/app/routes/uploads.py:19`) | Error documentado | `401`, `422` y `500` respectivamente. No tienen prueba específica. El `500` por escritura está descrito como inferencia en `ENDPOINTS.md`. |
| `GET /api/backend-health` | Backend responde `200` con cuerpo UTF-8; `test_backend_health_success_preserves_response_shape`, ejecutada | Camino feliz | La API devuelve `200` con `requestedBy`, el status del backend y el body decodificado. |
| `GET /api/backend-health` | Fallo de transporte; `test_backend_health_response_has_generic_transport_error`, ejecutada | Borde / fallo degradado | La API conserva `200` y responde `status: 0`, `body: "Backend health check failed"`. |
| `GET /api/backend-health` | Backend devuelve bytes no UTF-8; `test_backend_health_response_has_generic_error_for_invalid_utf8`, ejecutada | Error controlado | La API conserva `200`, `requestedBy` de la identidad autenticada, `status: 0` y `body: "Backend health check failed"`; no produce un 500. |
| `GET /api/backend-health` | Token inválido; `test_backend_health_rejects_invalid_token`, ejecutada | Error documentado | `401` con `{"detail":"Invalid token"}`. |

La suite también verifica la disponibilidad de `create_app` y `app.main:app`
(`test_app_factory_and_import_entrypoint_are_available`,
`api/tests/test_api.py:124`) y las versiones instaladas de dependencias
(`test_dependency_versions_after_update`, `api/tests/test_api.py:178`).

## Código de las pruebas

El código ejecutable completo y canónico está en
[api/tests/test_api.py](../api/tests/test_api.py). Se mantiene allí para evitar
copiarlo y que la documentación diverja de la suite. Incluye las pruebas
ejecutadas que se listan arriba; por ejemplo, la prueba de aislamiento de
owner verifica que la tarea sembrada de `trainer` no se filtra al token de
`student`:

```python
def test_owner_query_is_ignored_and_token_identity_is_used(tmp_path: Path) -> None:
    app = create_app(str(tmp_path / "workshop.db"), str(tmp_path / "uploads"))
    with TestClient(app) as client:
        response = client.get("/api/tasks?owner=trainer", headers=headers())
        summary_response = client.get("/api/summary?owner=trainer", headers=headers())

    assert response.status_code == 200
    assert len(response.json()) == 2
    assert {task["owner"] for task in response.json()} == {"student"}
    assert summary_response.json()["owner"] == "student"
    assert summary_response.json()["total"] == 2
```

### Pruebas propuestas (no ejecutadas)

Estos ejemplos cubren respuestas descritas en `ENDPOINTS.md` que aún no tienen
prueba específica. Son propuestas; no forman parte del resultado de la suite
ejecutada.

```python
@pytest.mark.parametrize(
    ("method", "path", "request_data"),
    [
        ("get", "/api/tasks", {}),
        ("post", "/api/tasks", {"json": {"title": "valid", "description": ""}}),
        ("get", "/api/summary", {}),
        (
            "post",
            "/api/requirements",
            {"files": {"file": ("requirements.txt", b"sample", "text/plain")}},
        ),
        ("get", "/api/backend-health", {}),
    ],
)
def test_all_endpoints_reject_missing_authorization(
    tmp_path: Path,
    method: str,
    path: str,
    request_data: dict[str, object],
) -> None:
    app = create_app(str(tmp_path / "workshop.db"), str(tmp_path / "uploads"))
    with TestClient(app) as client:
        response = getattr(client, method)(
            path,
            headers={"Authorization": "Bearer invalid"},
            **request_data,
        )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid token"}


def test_upload_requires_file(tmp_path: Path) -> None:
    app = create_app(str(tmp_path / "workshop.db"), str(tmp_path / "uploads"))
    with TestClient(app) as client:
        response = client.post("/api/requirements", headers=headers())

    assert response.status_code == 422


def test_tasks_and_summary_are_empty_for_owner_without_tasks(
    tmp_path: Path,
) -> None:
    app = create_app(str(tmp_path / "workshop.db"), str(tmp_path / "uploads"))
    identity_headers = headers(username="unseeded-user")

    with TestClient(app) as client:
        tasks = client.get("/api/tasks", headers=identity_headers)
        summary = client.get("/api/summary", headers=identity_headers)

    assert tasks.status_code == 200
    assert tasks.json() == []
    assert summary.status_code == 200
    assert summary.json()["total"] == 0
    assert summary.json()["byStatus"] == {}
    assert summary.json()["highPriorityOpen"] == 0
```

El test para `POST /api/tasks` con `{}` y los tests controlados de los errores
`500` también están pendientes. No se propone esperar un `500` de escritura o
decodificación hasta que se incorpore una inyección de fallo determinista.
Los límites/extensiones del archivo requieren primero una decisión de
producto; no se fija un umbral en este documento.

## Ejecuciones realizadas

### Ejecución válida

- **Componente / IDs:** api; H-API-02, H-API-03, H-API-05, H-API-06 y H-API-07
  (contexto histórico registrado en `PLAN.md`). Esta ejecución valida la suite
  vigente, pero no cambia el estado de hallazgos pendientes.
- **Directorio:** `api/`.
- **Comando:** `python -m pytest --cov=app --cov-report=term-missing --cov-fail-under=85`
- **Código de salida:** `0`.
- **Resultado real:** `15 passed`; 2 warnings (deprecación de Starlette/AnyIO y
  `ResourceWarning` por una conexión SQLite no cerrada). Cobertura global
  informada por pytest-cov: **97.96%**.
- **Reporte:** salida de cobertura en terminal con tabla por módulo; se mostró
  `TOTAL 188 statements, 2 missed, 8 branches, 2 partial` y
  `Required test coverage of 85% reached`.

### Intento con directorio incorrecto

- **Componente / IDs:** api; intento de ejecutar la misma suite.
- **Directorio:** raíz del repositorio, no `api/`.
- **Comando:** `python -m pytest --cov=app --cov-report=term-missing --cov-fail-under=85`
- **Código de salida:** `2`.
- **Resultado real:** no se recolectaron pruebas (`0 items`); importación fallida
  con `ModuleNotFoundError: No module named 'app'`. Es un error de directorio de
  ejecución, no un fallo de una prueba de producto. La ejecución desde `api/`
  que se registra arriba sí completó.

## Cobertura

| Métrica | Numerador / denominador | Resultado | Método |
|---|---:|---:|---|
| Código fuente de los archivos `api/app/*.py` modificados en el worktree (14 archivos) | 186 / 188 líneas ejecutables | **98.94%** | `coverage.analysis2()` sobre los archivos Python modificados o nuevos identificados con `git status`; se contaron statements ejecutados frente al total de statements de esos archivos. |
| Cobertura global de `app` (líneas y ramas) | 192 / 196 oportunidades | **97.96%** | pytest-cov, configuración de ramas activada en `api/pyproject.toml`; total de statements más destinos de ramas, según el resumen del reporte de terminal. |

La cobertura de archivos modificados supera el objetivo de 85%. La métrica es
por archivo fuente completo, no por líneas individuales del diff. La cobertura
global se conserva separada; no se interpreta como una medida de pruebas
integradas ni como verificación de comportamientos pendientes.

## Fallos, pendientes y pruebas propuestas

### Fallos

- El intento desde la raíz no pudo importar `app` (código de salida 2); repetir
  desde `api/` resolvió el problema de directorio.
- La ejecución correcta no tuvo pruebas fallidas. Sus dos warnings se anotan
  arriba y no se silencian.

### Pendientes

- Completar errores documentados por ruta: autenticación inválida en cada
  endpoint, archivo ausente (`422`), y los `500` descritos/inferidos en el
  contrato.
- Probar las colecciones y el resumen vacíos, payload `{}` para crear tarea y
  respuestas de validación adicionales documentadas.
- Definir tamaño máximo y extensiones antes de probar los límites de carga. El
  riesgo de lectura sin límite y filename no saneado sigue descrito en
  `ENDPOINTS.md` y relacionado con H-API-04; este documento no afirma que esté
  resuelto.
- H-API-01 continúa pendiente de coordinación con el emisor de tokens externo;
  las pruebas actuales caracterizan el formato legacy y no acreditan JWT.

### Pruebas propuestas

Las propuestas de código restantes aún deben añadirse a `api/tests/test_api.py`
y ejecutarse desde `api/`. Para H-API-08, la prueba de bytes no UTF-8 y la
caracterización de autenticación del endpoint ya se añadieron y ejecutaron.
Las pruebas de tamaño y extensión requieren que se acuerden primero los valores
aceptados. No se atribuyen resultados a ninguna prueba pendiente.

## Documentos consultados

- [README.md](../README.md)
- [RETO.md](../RETO.md)
- [GOOD_PRACTICES.md](./GOOD_PRACTICES.md)
- [HALLAZGOS.md](../HALLAZGOS.md)
- [PLAN.md](../PLAN.md)
- [ENDPOINTS.md](./ENDPOINTS.md)
- `api/pyproject.toml`
- [api/tests/test_api.py](../api/tests/test_api.py)
- Rutas, esquemas, seguridad, servicios y repositorio de `api/app/`.
