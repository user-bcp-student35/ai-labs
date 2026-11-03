# Discovery de API

## Contrato observado en el código

Actualización 2026-11-02: la implementación vigente está distribuida entre
`api/app/routes/`, `api/app/security.py` y `api/app/schemas.py`; la tabla
siguiente refleja los cambios aprobados de api. Las referencias del párrafo
introductorio corresponden al discovery previo a la separación de módulos.

El comportamiento y los contratos observados se documentan en `docs/ENDPOINTS.md`; los hallazgos candidatos de esta revisión se detallan al final de esta sección. Las cinco rutas dependen de `legacy_identity` y requieren un token en `Authorization` con esquema Bearer.

| Método y ruta | Entrada observada | Respuesta observada |
|---|---|---|
| `GET /api/tasks` | La identidad del token determina el owner; un query `owner` no declarado se ignora (api/app/routes/tasks.py:14). | Lista con `id`, `title`, `description`, `status`, `owner`, `priority` y `createdAt` (api/app/schemas.py:15). |
| `POST /api/tasks` | JSON tipado con `title`, `description`, `status` y `priority`; extras, incluido `owner`, se ignoran (api/app/schemas.py:6, api/app/routes/tasks.py:22). | `201` y respuesta `TaskOut` (api/app/schemas.py:15). |
| `GET /api/summary` | La identidad del token determina el owner; un query `owner` no declarado se ignora (api/app/routes/summary.py:14). | `owner`, `total`, `byStatus` y `highPriorityOpen` (api/app/schemas.py:27). |
| `POST /api/requirements` | Multipart con campo `file` (api/app/routes/uploads.py:11). | `201` con `owner`, `fileName`, `storedAt` y `size` (api/app/schemas.py:36). |
| `GET /api/backend-health` | Sin parámetros de ruta; consulta `AUTH_HEALTH_URL` o `http://localhost:8080/q/health` (api/app/routes/backend_health.py:22). | `requestedBy`, `status` y `body` (api/app/schemas.py:45); ante error, conserva forma y devuelve mensaje genérico. |

## Matriz de hallazgos

| id | componente | hallazgo | tipo | explicacion | evidencia (archivo:linea) | severidad | estado |
|---|---|---|---|---|---|---|---|
| H-API-01 | api | Token Base64 con secreto embebido y sin firma | Vulnerabilidad | Base64 solo codifica el contenido; el backend compara un secreto hardcodeado y comprueba la expiración, pero no verifica firma, emisor ni audiencia. El token no ofrece integridad criptográfica ni claims verificables. | api/app/security.py:8, api/app/security.py:17, api/app/security.py:19 | alta | CANDIDATO |
| H-API-02 | api | El cliente puede elegir el owner de lectura y escritura | Vulnerabilidad | `owner` de la query determinaba las tareas listadas y resumidas; además, el JSON permitía asignar el owner al crear una tarea. Nota de resolución: ahora las rutas usan exclusivamente `identity["username"]` e ignoran `owner` enviado por el cliente. | api/app/routes/tasks.py:18, api/app/routes/tasks.py:27, api/app/routes/summary.py:18 | alta | Resuelto |
| H-API-03 | api | Consultas SQL construidas por concatenación | Vulnerabilidad | Los valores de filtros y campos recibidos en la petición se interpolaban en SQL. Nota de resolución: las consultas del repositorio usan parámetros SQLite para filtros, inserts y recuperación por ID. | api/app/repositories/tasks.py:76, api/app/repositories/tasks.py:87, api/app/repositories/tasks.py:94, api/app/repositories/tasks.py:107 | alta | Resuelto |
| H-API-04 | api | Nombre y contenido del archivo subido sin controles | Vulnerabilidad | Se usa el nombre recibido para construir la ruta y se lee el archivo completo sin límite; no se valida extensión ni tamaño. Un nombre con ruta puede intentar escribir fuera del directorio previsto y una carga grande puede agotar recursos. | api/app/routes/uploads.py:17, api/app/routes/uploads.py:18, api/app/routes/uploads.py:19 | alta | CANDIDATO |
| H-API-05 | api | Dependencias fijadas a versiones señaladas para análisis SCA | Vulnerabilidad | `urllib3==2.5.0` estaba afectado por PYSEC-2026-1994 y `python-multipart==0.0.21` por CVE-2026-24486; se actualizaron a `urllib3==2.8.0` y `python-multipart==0.0.33`. Nota de resolución: las versiones se verificaron con PyPI y las versiones fijadas superan las corregidas de los avisos consultados. | api/requirements.txt:4, api/requirements.txt:5 | media | Resuelto |
| H-API-06 | api | Rutas, persistencia, reglas y serialización concentradas en un módulo | Refactor | `main.py` concentraba la inicialización de SQLite, rutas, reglas y serialización. Nota de resolución: se separaron rutas, servicios, repositorio, esquemas, dependencias y configuración, conservando `create_app` y `app.main:app`. | api/app/main.py:16, api/app/repositories/tasks.py:46, api/app/services/tasks.py:25, api/app/routes/tasks.py:12, api/app/schemas.py:6 | media | Resuelto |
| H-API-07 | api | Tipado crudo, excepciones amplias y lógica duplicada/anidada | Refactor | Los cuerpos y respuestas usaban `dict` con `Any`; había excepciones amplias, lógica duplicada y anidamiento en el resumen. Nota de resolución: se añadieron modelos Pydantic, excepciones específicas con mensajes genéricos, constantes y resumen sin anidamiento profundo. | api/app/schemas.py:6, api/app/schemas.py:15, api/app/schemas.py:27, api/app/security.py:22, api/app/routes/backend_health.py:30, api/app/services/tasks.py:25 | media | Resuelto |
| H-API-08 | api | Bytes no UTF-8 del servicio de salud pueden causar 500 | Defecto | La respuesta remota se decodifica después del bloque que captura errores de transporte y decodificación; bytes inválidos pueden escapar como excepción no controlada. | api/app/routes/backend_health.py:24, api/app/routes/backend_health.py:30, api/app/routes/backend_health.py:40 | media | CANDIDATO |
| H-API-09 | api | CORS permite cualquier origen, método y encabezado con credenciales | Configuración | La política acepta todos los orígenes, métodos y encabezados y habilita credenciales; el riesgo efectivo depende del modelo de credenciales y los orígenes previstos. | api/app/main.py:47, api/app/main.py:48, api/app/main.py:49, api/app/main.py:50 | media | CANDIDATO |

## Candidatos para revisión humana (2026-11-03)

### H-API-01 — Token predecible y sin verificación de integridad
- Estado: CANDIDATO
- Evidencia: `api/app/security.py:8` define un secreto fijo; `api/app/security.py:17` decodifica Base64 y `api/app/security.py:19` compara el secreto y la expiración, sin verificar una firma. Las rutas usan el `username` del token como propietario, por ejemplo `api/app/routes/tasks.py:17`.
- Impacto: una persona que conozca el formato y el secreto podría falsificar identidades y acceder a tareas asociadas a otros nombres.
- Prioridad propuesta: Alta.
- Contrato potencialmente afectado: autenticación y autorización ligada a la identidad del token en `/api/tasks` y `/api/summary`.
- Cómo validarlo: agregar pruebas de caracterización para tokens manipulados o no firmados y comprobar que las operaciones de lectura y escritura permanecen limitadas a la identidad autenticada.

### H-API-04 — La carga no restringe nombre, extensión ni tamaño
- Estado: CANDIDATO
- Evidencia: `api/app/routes/uploads.py:17` construye la ruta con el nombre enviado, `api/app/routes/uploads.py:18` lee el archivo completo y `api/app/routes/uploads.py:19` lo escribe sin validar extensión o tamaño. La prueba existente solo comprueba una carga normal: `api/tests/test_api.py:64`.
- Impacto: un nombre de archivo no confiable puede intentar escribir fuera del directorio previsto; una carga grande puede consumir memoria y almacenamiento.
- Prioridad propuesta: Alta.
- Contrato potencialmente afectado: `POST /api/requirements`; el acuerdo documentado exige controlar nombre, tamaño y extensión (`docs/ENDPOINTS.md`, sección “Contrato acordado”).
- Cómo validarlo: probar nombres con rutas, extensiones no permitidas y tamaños sobre el límite acordado en un directorio temporal; comprobar rechazo y ausencia de escrituras fuera del área de carga.

### H-API-08 — Una respuesta no UTF-8 del backend puede producir un 500
- Estado: CANDIDATO
- Evidencia: la petición y sus errores se manejan en `api/app/routes/backend_health.py:24` y `api/app/routes/backend_health.py:30`, pero la decodificación está en `api/app/routes/backend_health.py:40`, fuera de ese manejo. Las pruebas existentes cubren transporte y UTF-8 válido (`api/tests/test_api.py:192`, `api/tests/test_api.py:208`), no bytes inválidos.
- Impacto: un cuerpo mal codificado del servicio consultado puede escapar como excepción no controlada y romper la respuesta esperada de salud.
- Prioridad propuesta: Media.
- Contrato potencialmente afectado: formato estable de `GET /api/backend-health`; las excepciones no controladas producen 500 según `docs/ENDPOINTS.md`.
- Cómo validarlo: simular una respuesta del backend con bytes inválidos para UTF-8 y comprobar que se mantiene la respuesta de error documentada, sin un 500 inesperado.

### H-API-09 — CORS acepta cualquier origen con credenciales habilitadas
- Estado: CANDIDATO
- Evidencia: `api/app/main.py:47` permite todos los orígenes, `api/app/main.py:48` habilita credenciales y `api/app/main.py:49`–`api/app/main.py:50` permiten todos los métodos y encabezados.
- Impacto: la política no limita los sitios que pueden iniciar interacciones cross-origin; el riesgo efectivo depende de cómo se adjunten credenciales y de los orígenes previstos para despliegue.
- Prioridad propuesta: Media, sujeta a confirmar el modelo de credenciales y los orígenes autorizados.
- Contrato potencialmente afectado: política CORS de todos los endpoints.
- Cómo validarlo: probar solicitudes preflight y solicitudes con un `Origin` no autorizado; comparar los encabezados resultantes con una lista de orígenes aprobada.
