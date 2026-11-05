# Proposal

## Why

Issue [#22](https://github.com/user-bcp-student35/ai-labs/issues/22) reports that credential text can alter the login database lookup and allow authentication without valid credentials. Treating submitted credentials as data rather than query logic prevents this bypass while preserving normal sign-in.

## What Changes

- Require `POST /auth/login` to authenticate only when the submitted username and password match a stored account.
- Require SQL-like input in either credential field to be rejected as invalid credentials, with no token issued.
- Preserve successful login behavior for valid credentials and the existing endpoint response contract.

### Alcance

El cambio cubre únicamente el componente `auth/` y el comportamiento observable del inicio de sesión afectado por H-AUTH-01.

### Fuera de alcance

- Cambios en `api/`, `web/` u otros componentes.
- Cambios al formato, contenido o expiración del token.
- Cambios a los demás campos de respuesta, la validación general del request o el esquema de usuarios.
- Rediseño de la arquitectura de autenticación.

### Comportamiento que debe preservarse

- La ruta continúa siendo `POST /auth/login`.
- Credenciales válidas (`student` / `Workshop123!`) continúan devolviendo HTTP 200, `user.username` igual a `student` y un `token`.
- El Issue no cambia el contrato de éxito. `docs/ENDPOINTS.md` identifica que auth emite el token, pero no documenta los detalles de la respuesta de login; se conserva la respuesta caracterizada actualmente por `AuthResourceTest`.

## Capabilities

### New Capabilities

- `auth-login`: Autenticación observable mediante el endpoint de inicio de sesión, incluyendo rechazo de credenciales que intenten alterar la búsqueda.

### Modified Capabilities

- Ninguna. No hay specs existentes y se introduce una capability nueva para el comportamiento de login que el Issue define.

## Impact

- API afectada: `POST /auth/login`; las credenciales que antes podían alterar la búsqueda deben tratarse como inválidas (HTTP 401, sin `token`).
- Área del componente: búsqueda de credenciales en `auth/` y su prueba de endpoint.
- Sin cambios a dependencias ni al comportamiento de `api/` o `web/`.
