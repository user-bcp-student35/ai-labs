# Evidencia de implementación — API / H-API-08

## Cambio

- Se incluyó la decodificación UTF-8 de la respuesta remota dentro del manejo de errores ya existente en `api/app/routes/backend_health.py`.
- Una respuesta remota con bytes no UTF-8 conserva el contrato de fallo de `GET /api/backend-health`: HTTP 200, identidad autenticada, `status: 0` y `body: "Backend health check failed"`.
- Se agregaron pruebas para bytes no UTF-8 y token inválido. Se actualizaron `docs/ENDPOINTS.md` y `docs/TESTING.md`.
- No se modificaron autenticación, configuración, dependencias ni otros endpoints.

## Comprobación

Comandos ejecutados desde la raíz, salvo donde se indica:

| Comando | Resultado real |
|---|---|
| `python tools/lab.py test api` (baseline, antes de implementar) | 14 pasaron, 1 falló; cobertura 98.08%. El fallo previo fue `test_dependency_versions_after_update`: entorno con `urllib3==2.5.0`, prueba exige `2.8.0`. |
| `Push-Location api; try { .\.venv\Scripts\python.exe -m pytest tests\test_api.py -k invalid_utf8 -q } finally { Pop-Location }` (antes del cambio) | Falló como se esperaba: `UnicodeDecodeError` no controlado al decodificar `b"\xff"`. |
| `Push-Location api; try { .\.venv\Scripts\python.exe -m pytest tests\test_api.py -k backend_health -q } finally { Pop-Location }` (después del cambio) | 4 pasaron. |
| `Push-Location api; try { .\.venv\Scripts\python.exe -m pytest tests -k "not dependency_versions_after_update" --cov=app --cov-report=term-missing --cov-fail-under=85 -q } finally { Pop-Location }` | 16 pasaron; cobertura total 98.09%, gate de 85% satisfecho. |
| `python tools/lab.py test api` (después del cambio) | 16 pasaron, 1 falló; cobertura 98.09%. Sigue fallando únicamente `test_dependency_versions_after_update`, por la misma discrepancia del entorno `urllib3==2.5.0` frente a `2.8.0`. |

El fallo de versión también estaba presente antes del cambio. No se instaló ni cambió ninguna dependencia porque los manifiestos no son parte de H-API-08.

## Contratos preservados

- `GET /api/backend-health`, autenticación y campos `requestedBy`, `status` y `body`.
- Respuesta UTF-8 válida: estado y cuerpo del backend reflejados, API responde HTTP 200.
- Fallo de transporte o decodificación: respuesta genérica documentada con HTTP 200.
- Token inválido: HTTP 401 con `{"detail": "Invalid token"}`.

Referencias: [spec](./docs/specs/H-API-08.md), [contrato del endpoint](./docs/ENDPOINTS.md), [matriz de pruebas](./docs/TESTING.md).

## Pendiente y revisión

- La suite completa no queda totalmente verde hasta que el entorno de pruebas use la versión de `urllib3` fijada y esperada por la prueba existente.
- Revisión humana del cambio pendiente. Conforme al cierre local del Día 1, no se creó PR remoto ni se hizo push.
