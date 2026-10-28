# Hallazgos

| id | componente | hallazgo | tipo | explicacion | evidencia (archivo:linea) | severidad | estado |
|---|---|---|---|---|---|---|---|
| H-AUTH-01 | auth | Contraseñas almacenadas en texto plano | Vulnerabilidad | Resolución parcial: el esquema activo almacena hashes PBKDF2-SHA256 con salt y elimina la columna plaintext, pero la migración no activa ni verifica borrado seguro de las páginas SQLite; no garantiza que el valor anterior sea irrecuperable de la base migrada. | auth/src/main/java/com/bcp/workshop/auth/PasswordHasher.java:23-60; auth/src/main/java/com/bcp/workshop/auth/UserRepository.java:154-168 | alta | Pendiente |
| H-AUTH-02 | auth | Concatenación de credenciales en SQL | Vulnerabilidad | La interpolación permitía alterar la consulta. Resolución: consulta por username con `PreparedStatement` y verificación del hash fuera del SQL; entradas no coincidentes siguen recibiendo 401. | auth/src/main/java/com/bcp/workshop/auth/UserRepository.java:46-47,76-77 | alta | Resuelto |
| H-AUTH-03 | auth | Token Base64 con secreto embebido y sin firma verificable | Vulnerabilidad | Base64 no protegía integridad ni autenticidad. Resolución: emisión de JWT firmado con subject, role/group y expiración; claves configuradas externamente y validadas en pruebas. | auth/src/main/java/com/bcp/workshop/auth/TokenService.java:11-20; auth/src/main/resources/application.properties:10-12 | alta | Resuelto |
| H-AUTH-04 | auth | Respuesta de error expone detalles internos | Vulnerabilidad | La respuesta 500 exponía mensaje y clase de excepción. Resolución: `AuthExceptionMapper` registra el detalle en el servidor y devuelve solo un mensaje genérico. | auth/src/main/java/com/bcp/workshop/auth/AuthExceptionMapper.java:8-19 | alta | Resuelto |
| H-AUTH-05 | auth | Secreto embebido y política CORS abierta | Vulnerabilidad | Resolución parcial: la clave de firma y los orígenes CORS se configuran externamente. La opción por defecto aún permite cualquier origen (`/.*/`); falta acordar una allowlist y restringirla, por lo que el riesgo permanece. | auth/src/main/resources/application.properties:5,10-11 | alta | Pendiente |
| H-AUTH-06 | auth | Dependencias fijadas a Quarkus 3.27.4 y Commons Text 1.9 | Vulnerabilidad | Resolución: Quarkus actualizado a 3.27.5 (parche para CVE-2026-50559) y Commons Text a 1.15.0 (posterior a la versión corregida de CVE-2022-42889). CodeQL y Dependency Review remotos no se ejecutaron. | auth/pom.xml:13,57-58 | media | Resuelto |
| H-AUTH-07 | auth | AuthResource concentra validación, negocio, persistencia y respuesta | Refactor | El método original mezclaba varias responsabilidades. Resolución: Resource conserva validación HTTP y mapping; autenticación está en Service, SQL en Repository, hash/token en servicios dedicados y la respuesta usa DTOs. | auth/src/main/java/com/bcp/workshop/auth/AuthResource.java:25-63; auth/src/main/java/com/bcp/workshop/auth/AuthService.java:25-43; auth/src/main/java/com/bcp/workshop/auth/UserRepository.java:63-80 | baja | Resuelto |
| H-AUTH-08 | auth | Contrato observado de POST /auth/login; falta contrato acordado | Sugerencia | Contrato observado documentado en `docs/ENDPOINTS.md`, incluyendo validaciones 400, rechazo 401, respuesta 200 y preguntas abiertas; falta registrar aprobación formal, por lo que el hallazgo sigue pendiente. | auth/src/main/java/com/bcp/workshop/auth/AuthResource.java:14-64 | baja | Pendiente |

## Candidatos de discovery — auth (2026-10-27)

### H-AUTH-09 — Cuentas semilla con contraseñas fijas
- Estado: CANDIDATO
- Evidencia: `auth/src/main/java/com/bcp/workshop/auth/UserRepository.java:27-32` define contraseñas constantes para `student` y `trainer`; `:122-135` las pasa al sembrado durante la inicialización, y `:235-263` inserta la cuenta cuando no existe. No hay una condición de perfil en esa ruta de inicialización.
- Impacto: una base inicializada o a la que le falte alguna cuenta puede aceptar credenciales conocidas; la cuenta `trainer` se crea con rol `TRAINER`. El riesgo depende de que esas cuentas estén accesibles fuera del entorno ficticio del taller.
- Prioridad propuesta: Media; alta si se confirma que el servicio está expuesto fuera del taller sin rotación o desactivación de las cuentas.
- Contrato potencialmente afectado: credenciales y roles emitidos por `POST /auth/login`.
- Cómo validarlo: con una base SQLite aislada, inicializar el servicio y comprobar si ambas credenciales constantes permiten login; revisar la configuración de despliegue para determinar si el sembrado se ejecuta en entornos expuestos y si existe rotación. `UserRepositoryTest` ya comprueba que se siembra `student`, pero no valida una restricción por entorno.

### H-AUTH-10 — Diferencia temporal entre usuario inexistente y contraseña incorrecta
- Estado: CANDIDATO
- Evidencia: `auth/src/main/java/com/bcp/workshop/auth/AuthService.java:25-28` retorna al no encontrar usuario antes de llamar `PasswordHasher.verify`; para una cuenta existente sí verifica el hash. `auth/src/main/java/com/bcp/workshop/auth/PasswordHasher.java:16,36-60` establece 600.000 iteraciones PBKDF2 y las ejecuta al verificar.
- Impacto: el distinto coste de las dos rutas puede permitir inferir si un nombre de usuario existe mediante mediciones repetidas, pese a que ambas respuestas se rechazan con HTTP 401.
- Prioridad propuesta: Media.
- Contrato potencialmente afectado: privacidad de la identidad de cuenta y respuesta de rechazo de `POST /auth/login`.
- Cómo validarlo: medir en un entorno de prueba aislado la distribución de latencias para muchas solicitudes con usuario inexistente y con usuario existente/contraseña incorrecta; comprobar si la diferencia es distinguible bajo condiciones repetibles. Las pruebas actuales caracterizan el status, no la latencia.

### H-AUTH-11 — Errores del framework sin contrato comprobado ante el mapper global
- Estado: CANDIDATO
- Evidencia: `auth/src/main/java/com/bcp/workshop/auth/AuthExceptionMapper.java:9,14-18` registra un `ExceptionMapper<Exception>` que transforma excepciones en HTTP 500. `docs/TESTING.md:25` y `docs/ENDPOINTS.md:182-183` dejan sin fijar las respuestas para JSON malformado y `Content-Type` no soportado.
- Impacto: si esas excepciones del framework llegan al mapper, solicitudes inválidas podrían recibir HTTP 500 en vez de un error 4xx, afectando la clasificación de errores y el comportamiento de reintento de clientes. El efecto concreto está pendiente de verificación.
- Prioridad propuesta: Media.
- Contrato potencialmente afectado: estados y formato de error de `POST /auth/login`.
- Cómo validarlo: enviar JSON malformado y un `Content-Type` no soportado al endpoint en una prueba de integración; registrar status y cuerpo exactos y comprobar si el mapper global interviene antes de acordar el contrato esperado.
