# ENDPOINTS

## api

Componente: api. Hallazgos relacionados: H-API-NN (pendiente de enlazar con HALLAZGOS.md).
Estado: contrato **observado** en el código actual (`api/app/`). El contrato acordado y los riesgos pendientes están al final de la sección.

### Convenciones generales

- Base URL: sin prefijo (`/api/...`). El host y el puerto dependen del despliegue (pendiente de verificar en `compose.yaml`).
- Formato: JSON (`application/json`), salvo `POST /api/requirements`, que usa `multipart/form-data`.
- Las respuestas usan camelCase (`createdAt`, `byStatus`, `highPriorityOpen`, `fileName`, `storedAt`, `requestedBy`). El body de `POST /api/tasks` usa `title`, `description`, `status` y `priority`.
- Autenticación (los 5 endpoints): header `Authorization: Bearer <token>`. El token lo emite `POST /auth/login` (componente auth, fuera de este documento).
  - El token es Base64 de `usuario|rol|expiracionEpochSegundos|secreto` (api/app/security.py).
  - La API usa el `username` del token como propietario. El `role` se lee, pero no se usa para autorizar.
  - El prefijo `Bearer ` no se exige. Se elimina de la cadena, así que un token sin prefijo también se acepta.
- Error de autenticación común (401), válido para los 5 endpoints. Ocurre si el header falta o está vacío, si el Base64 o el UTF-8 son inválidos, si el token no tiene 4 partes, si el secreto no coincide, si la expiración no es entera o si ya venció:
  ```json
  { "detail": "Invalid token" }
  ```
- Error de validación común (422, formato por defecto de FastAPI/Pydantic) cuando el cuerpo o los parámetros no cumplen el esquema. Se detalla en cada endpoint donde aplica.
- Una excepción no controlada devuelve 500 con cuerpo de texto plano `Internal Server Error` (comportamiento por defecto de Starlette, no definido en el código de la API).
- CORS: `allow_origins=["*"]`, `allow_credentials=True`, todos los métodos y headers (api/app/main.py).

---

### 1. GET /api/tasks

1. **Qué hace:** lista las tareas del usuario autenticado, ordenadas por id ascendente.
2. **Autenticación:** sí. `Authorization: Bearer <token>`.
3. **Request:** sin parámetros de query, path ni body.

   | Campo/parámetro | Tipo | Obligatorio | Descripción |
   |---|---|---|---|
   | Authorization (header) | string | Sí | `Bearer <token>` |

   ```http
   GET /api/tasks HTTP/1.1
   Authorization: Bearer <token de student>
   ```
4. **Respuesta exitosa: 200**

   | Campo | Tipo | Descripción |
   |---|---|---|
   | (raíz) | array de Task | `[]` si el usuario no tiene tareas |
   | id | integer | Identificador autoincremental |
   | title | string | Título |
   | description | string | Descripción |
   | status | string | Texto libre. Valor por defecto `TODO` |
   | owner | string | Usuario propietario (el del token) |
   | priority | string | Texto libre. Valor por defecto `MEDIUM` |
   | createdAt | string | `YYYY-MM-DD HH:MM:SS` (`datetime('now')` de SQLite, UTC) |

   ```json
   [
     {"id": 1, "title": "Refactor login", "description": "Separar responsabilidades en frontend",
      "status": "TODO", "owner": "student", "priority": "HIGH", "createdAt": "2026-11-02 22:09:40"},
     {"id": 2, "title": "Review API", "description": "Revisar seguridad de endpoints",
      "status": "IN_PROGRESS", "owner": "student", "priority": "MEDIUM", "createdAt": "2026-11-02 22:09:40"}
   ]
   ```
   Los datos son la semilla de api/app/repositories/tasks.py para `student`. Las fechas son ilustrativas.
5. **Errores**

   | Código | Cuándo | Cuerpo |
   |---|---|---|
   | 401 | Token ausente, mal formado, con secreto incorrecto o vencido | `{"detail": "Invalid token"}` |

6. **Seguridad:** el filtro es `WHERE owner = ?` con el usuario del token, en una consulta parametrizada. No existe un parámetro `owner`, así que no se pueden leer tareas de otro usuario.

---

### 2. POST /api/tasks

1. **Qué hace:** crea una tarea a nombre del usuario autenticado.
2. **Autenticación:** sí. `Authorization: Bearer <token>`.
3. **Request:** `Content-Type: application/json`.

   | Campo | Tipo | Obligatorio | Descripción |
   |---|---|---|---|
   | title | string | No (defecto `""`) | Título. Se acepta vacío |
   | description | string | No (defecto `""`) | Descripción |
   | status | string | No (defecto `"TODO"`) | Texto libre, sin lista cerrada de valores |
   | priority | string | No (defecto `"MEDIUM"`) | Texto libre. El resumen reconoce `HIGH` |

   Los campos extra se ignoran (`extra="ignore"`). Un `owner` enviado en el body se descarta.

   ```http
   POST /api/tasks HTTP/1.1
   Authorization: Bearer <token de student>
   Content-Type: application/json

   {"title": "Escribir pruebas", "description": "Cubrir summary", "status": "TODO", "priority": "HIGH"}
   ```
4. **Respuesta exitosa: 201**

   | Campo | Tipo | Descripción |
   |---|---|---|
   | id | integer | Id asignado |
   | title | string | Título guardado |
   | description | string | Descripción guardada |
   | status | string | Estado guardado |
   | owner | string | Usuario del token |
   | priority | string | Prioridad guardada |
   | createdAt | string | `YYYY-MM-DD HH:MM:SS` (UTC) |

   ```json
   {"id": 4, "title": "Escribir pruebas", "description": "Cubrir summary", "status": "TODO",
    "owner": "student", "priority": "HIGH", "createdAt": "2026-11-02 22:09:40"}
   ```
5. **Errores**

   | Código | Cuándo | Cuerpo |
   |---|---|---|
   | 401 | Token inválido | `{"detail": "Invalid token"}` |
   | 422 | Body no es JSON válido, o un campo no es string (por ejemplo `"title": 123`) | `{"detail":[{"type":"string_type","loc":["body","title"],"msg":"Input should be a valid string","input":123}]}` |
   | 500 | No se pudo releer la fila creada (`RuntimeError` en el repositorio) | `Internal Server Error` (texto plano) |

   El `type` y el `msg` exactos del 422 dependen de la versión de Pydantic.
6. **Seguridad:** el propietario sale del token (`identity["username"]`), nunca del body. El INSERT está parametrizado. No hay validación de longitud ni de valores permitidos para `status` y `priority`.

---

### 3. GET /api/summary

1. **Qué hace:** devuelve el total de tareas del usuario, el conteo por estado y cuántas tareas de prioridad alta siguen abiertas.
2. **Autenticación:** sí. `Authorization: Bearer <token>`.
3. **Request:** sin parámetros.

   | Campo/parámetro | Tipo | Obligatorio | Descripción |
   |---|---|---|---|
   | Authorization (header) | string | Sí | `Bearer <token>` |

   ```http
   GET /api/summary HTTP/1.1
   Authorization: Bearer <token de student>
   ```
4. **Respuesta exitosa: 200**

   | Campo | Tipo | Descripción |
   |---|---|---|
   | owner | string | Usuario del token |
   | total | integer | Cantidad de tareas del usuario |
   | byStatus | objeto `{string: integer}` | Conteo por cada status presente. Solo aparecen los estados que existen. `{}` si no hay tareas |
   | highPriorityOpen | integer | Tareas con `priority == "HIGH"` y status distinto de `DONE` y `ARCHIVED` (sensible a mayúsculas) |

   ```json
   {"owner": "student", "total": 2, "byStatus": {"TODO": 1, "IN_PROGRESS": 1}, "highPriorityOpen": 1}
   ```
5. **Errores**

   | Código | Cuándo | Cuerpo |
   |---|---|---|
   | 401 | Token inválido | `{"detail": "Invalid token"}` |

6. **Seguridad:** igual que `GET /api/tasks`. Los cálculos usan solo las filas del usuario del token y no existe `owner` como parámetro.

---

### 4. POST /api/requirements

1. **Qué hace:** recibe un archivo de requerimientos del usuario y lo guarda en el servidor.
2. **Autenticación:** sí. `Authorization: Bearer <token>`.
3. **Request:** `Content-Type: multipart/form-data`.

   | Campo | Tipo | Obligatorio | Descripción |
   |---|---|---|---|
   | file | archivo (multipart) | Sí | Contenido a guardar. Se usa el `filename` original del archivo |
   | Authorization (header) | string | Sí | `Bearer <token>` |

   ```bash
   curl -X POST http://localhost:8000/api/requirements \
     -H "Authorization: Bearer <token>" \
     -F "file=@requisitos.txt"
   ```
   El host y el puerto del ejemplo son ilustrativos.
4. **Respuesta exitosa: 201**

   | Campo | Tipo | Descripción |
   |---|---|---|
   | owner | string | Usuario del token |
   | fileName | string o null | `filename` recibido |
   | storedAt | string | Ruta en el servidor: `<upload_dir>/<filename>` |
   | size | integer | Bytes escritos |

   ```json
   {"owner": "student", "fileName": "requisitos.txt", "storedAt": "uploads/requisitos.txt", "size": 1234}
   ```
   El directorio por defecto es `./uploads` (`WORKSHOP_UPLOAD_DIR`). El separador de `storedAt` depende del sistema operativo. El tamaño es ilustrativo.
5. **Errores**

   | Código | Cuándo | Cuerpo |
   |---|---|---|
   | 401 | Token inválido | `{"detail": "Invalid token"}` |
   | 422 | Falta el campo `file` | `{"detail":[{"type":"missing","loc":["body","file"],"msg":"Field required","input":null}]}` |
   | 500 | Fallo de escritura (por ejemplo, nombre inválido para el sistema de archivos). Es una inferencia: el código no captura excepciones | `Internal Server Error` (texto plano) |

6. **Seguridad (el código actual no cumple "controla nombre, tamaño y extensión" de AGENTS.md):**
   - No se sanea `file.filename`. Se concatena a la ruta de destino (api/app/routes/uploads.py), lo que expone riesgo de path traversal.
   - No hay límite de tamaño ni lista de extensiones. Todo el archivo se lee en memoria.
   - Un archivo con el mismo nombre se sobrescribe y los archivos no se separan por usuario.
   - `storedAt` revela la ruta interna del servidor.
   - `owner` solo se devuelve en la respuesta. No condiciona dónde ni cómo se guarda el archivo.

---

### 5. GET /api/backend-health

1. **Qué hace:** consulta el estado del servicio backend de autenticación y devuelve su respuesta, indicando quién lo pidió.
2. **Autenticación:** sí. `Authorization: Bearer <token>`.
3. **Request:** sin parámetros. La URL consultada no viene del cliente. Sale de la variable de entorno `AUTH_HEALTH_URL`, con defecto `http://localhost:8080/q/health` y un timeout de 3 s.

   | Campo/parámetro | Tipo | Obligatorio | Descripción |
   |---|---|---|---|
   | Authorization (header) | string | Sí | `Bearer <token>` |

   ```http
   GET /api/backend-health HTTP/1.1
   Authorization: Bearer <token de student>
   ```
4. **Respuesta exitosa: 200**

   | Campo | Tipo | Descripción |
   |---|---|---|
   | requestedBy | string | Usuario del token |
   | status | integer | Código HTTP del backend, o `0` si la consulta falló |
   | body | string | Cuerpo del backend decodificado como UTF-8, o `"Backend health check failed"` si falló |

   Backend alcanzable (el cuerpo es ilustrativo y depende del servicio):
   ```json
   {"requestedBy": "student", "status": 200, "body": "{\"status\":\"UP\",\"checks\":[]}"}
   ```
   Backend inalcanzable (la API igualmente responde 200):
   ```json
   {"requestedBy": "student", "status": 0, "body": "Backend health check failed"}
   ```
   Si el backend responde 4xx/5xx, se refleja tal cual en `status` y `body`, y la API sigue respondiendo 200.
   Si el cuerpo remoto no se puede decodificar como UTF-8, se devuelve el mismo fallback de consulta fallida.
5. **Errores**

   | Código | Cuándo | Cuerpo |
   |---|---|---|
   | 401 | Token inválido | `{"detail": "Invalid token"}` |

6. **Seguridad:** el destino es fijo por configuración del servidor, sin entrada del cliente, así que no hay SSRF por parámetro. El detalle de los errores de red solo se registra en el log. El `body` del backend se reenvía íntegro al cliente.

---

## Contrato acordado (referencia)

- Conservar `/api/tasks`, `/api/summary`, `/api/requirements` y `/api/backend-health` y sus formatos (AGENTS.md, api, punto 1).
- Autorización ligada a la identidad del token, sin parámetro `owner`.
- Consultas parametrizadas.
- Control de nombre, tamaño y extensión de archivos: acordado, pero **aún no implementado** (ver riesgos).

## Riesgos pendientes

| Riesgo | Endpoint | Evidencia |
|---|---|---|
| Path traversal y sobrescritura por `filename` sin sanear | POST /api/requirements | api/app/routes/uploads.py |
| Sin límite de tamaño ni de extensión | POST /api/requirements | api/app/routes/uploads.py |
| `storedAt` expone la ruta interna | POST /api/requirements | api/app/schemas.py (`UploadOut`) |
| `status` y `priority` aceptan cualquier string y `title` puede ser `""` | POST /api/tasks | api/app/schemas.py (`TaskCreate`) |
| Secreto legacy fijo en el código y token sin firma criptográfica | todos | api/app/security.py |
| Decodificación UTF-8 del backend fuera del `try` | GET /api/backend-health | api/app/routes/backend_health.py |
| CORS abierto con credenciales | todos | api/app/main.py |

## Preguntas abiertas

1. Con token inválido y body inválido a la vez, ¿se devuelve 401 o 422? Se espera 401 (la dependencia de seguridad), pero no está probado.
2. ¿Qué ocurre si `file.filename` viene vacío? El código no lo trata de forma explícita.
3. ¿Cuáles son los valores permitidos de `status` y `priority`? El código usa `TODO`, `IN_PROGRESS`, `DONE`, `ARCHIVED`, `HIGH`, `MEDIUM` y `LOW`, pero no los valida.
4. Los 500 por fallo de escritura o de decodificación se infirieron del código. Falta verificarlos en una ejecución real.
5. ¿Cuál es la URL base y el puerto del despliegue? Dependen de `compose.yaml`, que no se consultó.
6. Los riesgos no tienen ID H-API-NN porque HALLAZGOS.md no se consultó.
