# Contratos observados — auth

Este documento describe lo que está implementado en `auth/`; no sustituye la
aprobación formal del contrato. Los endpoints de autenticación y salud se
documentan por separado.

## Estado del contrato

- **Observado:** `POST /auth/login` está implementado y caracterizado en
  `AuthResource` y `AuthResourceTest`.
- **Acordado:** no hay evidencia de aprobación humana formal en los artefactos
  consultados. No se presenta el contrato observado como una decisión aprobada.
- **Riesgos y preguntas pendientes:** H-AUTH-01 sigue pendiente porque la
  migración no verifica el borrado seguro de datos antiguos de SQLite.
  H-AUTH-05 sigue pendiente porque CORS permite cualquier origen por defecto.
  H-AUTH-08 queda pendiente hasta registrar la aprobación formal. La respuesta
  exacta del endpoint de salud y los errores generados directamente por
  Quarkus requieren verificación en ejecución.

## GET /q/health

### 1. Qué hace

Expone el estado de salud del servicio de autenticación para que un monitor u
orquestador pueda comprobar si responde.

### 2. Autenticación

No requiere autenticación según la configuración de `auth/`; no se define un
header `Authorization` para esta ruta.

### 3. Request

No se definen parámetros de ruta, query ni cuerpo de solicitud en el código de
`auth/`.

| campo | tipo | obligatorio | descripcion |
|---|---|---|---|
| — | — | No | Solicitud GET sin campos ni cuerpo definidos por este componente. |

Ejemplo de solicitud: `GET /q/health` (sin cuerpo JSON).

### 4. Response exitosa

La dependencia `quarkus-smallrye-health` expone el endpoint de salud. El código
de `auth/` no registra health checks propios; el cuerpo concreto no está fijado
por un recurso de este componente.

- **Estado observado por el proveedor:** HTTP 200 cuando el proveedor informa
  estado saludable. La prueba de integración local confirma HTTP 200, `UP` y
  una lista de checks vacía en la configuración actual.
- **Ejemplo verificado localmente** por
  `AuthResourceTest.reportsHealthyStatus` y
  `AuthResourceTest.reportsNoHealthChecksWithoutAuthorization`:

```json
{
  "status": "UP",
  "checks": []
}
```

| campo | tipo | descripcion |
|---|---|---|
| `status` | string | Estado global que informa el proveedor de health. |
| `checks` | array | Resultados de health checks registrados por el proveedor; `auth/` no registra ninguno propio. |

### 5. Respuestas de error

`auth/` no implementa un cuerpo de error para este endpoint. La prueba local
confirma que el proveedor actual no registra checks y responde saludable; no
confirma qué respuestas HTTP ni qué cuerpo devuelve una instancia cuando un
health check falla. No se documenta un ejemplo de error como contrato sin
verificar esa respuesta.

**Pregunta abierta:** ¿Qué status y cuerpo entrega la versión desplegada de
Quarkus cuando el estado de salud es `DOWN`? Confirmarlo contra la instancia
antes de que otro componente dependa de ese comportamiento.

### 6. Notas de seguridad

- La ruta es de monitoreo y no requiere credenciales según el código de este
  componente. No debe tratarse como prueba de que el endpoint de login o la
  base de datos aceptan operaciones.
- La ruta procede de la extensión Quarkus declarada en
  `auth/pom.xml:40`; no existe una implementación propia en `auth/` que amplíe
  su contrato.

**Evidencia:** `auth/pom.xml:40`; la búsqueda del código Java de `auth/` no
encontró recursos ni checks de salud propios.

## POST /auth/login

### 1. Qué hace

Autentica las credenciales enviadas y, si son válidas, entrega la identidad
básica del usuario y un token para que el cliente continúe su flujo de sesión.

### 2. Autenticación

No requiere un token previo ni un header `Authorization`; las credenciales se
envían en el cuerpo JSON. La ruta está en
`auth/src/main/java/com/bcp/workshop/auth/AuthResource.java:23-25`.

### 3. Request

Enviar `Content-Type: application/json`.

| campo | tipo | obligatorio | descripcion |
|---|---|---|---|
| `username` | string | Sí | Nombre de usuario; se rechaza si es nulo o está en blanco. |
| `password` | string | Sí | Contraseña; se rechaza si es nula o está en blanco. |
| `client` | string | No | Campo aceptado por el DTO, pero no participa en la autenticación. |

Ejemplo JSON completo con el usuario ficticio de taller:

```json
{
  "username": "student",
  "password": "Workshop123!",
  "client": "angular-workshop"
}
```

La validación y los campos del request se encuentran en
`auth/src/main/java/com/bcp/workshop/auth/AuthResource.java:26-36` y
`auth/src/main/java/com/bcp/workshop/auth/LoginRequest.java:3-6`.

### 4. Response exitosa

- **Estado:** HTTP 200.
- **Content-Type:** `application/json`.

| campo | tipo | descripcion |
|---|---|---|
| `token` | string | JWT firmado; su valor cambia en cada emisión. |
| `expiresIn` | integer | Duración del token en segundos: `3600`. |
| `user` | object | Datos públicos del usuario autenticado. |
| `user.username` | string | Nombre de usuario. |
| `user.displayName` | string | Nombre visible, escapado para HTML por el recurso. |
| `user.role` | string | Rol del usuario. |
| `debug` | string | Valor observado fijo: `authenticated-with-legacy-flow`. |

Ejemplo JSON completo. El token está representado por un marcador porque el
servicio firma un valor dinámico; el marcador no es un token utilizable:

```json
{
  "token": "<JWT firmado generado por el servicio>",
  "expiresIn": 3600,
  "user": {
    "username": "student",
    "displayName": "Workshop Student",
    "role": "STUDENT"
  },
  "debug": "authenticated-with-legacy-flow"
}
```

La respuesta se construye en
`auth/src/main/java/com/bcp/workshop/auth/AuthResource.java:47-58`;
los tipos están en `LoginResponse.java:3` y `UserResponse.java:3`.

### 5. Respuestas de error

Todas las respuestas de error implementadas por el recurso usan JSON con un
campo `message`.

| estado | cuando ocurre | ejemplo de cuerpo |
|---|---|---|
| HTTP 400 | El cuerpo JSON es `null`. | `{"message":"Request is null"}` |
| HTTP 400 | `username` es nulo, está ausente o contiene solo espacios. | `{"message":"Username is required"}` |
| HTTP 400 | `password` es nula, está ausente o contiene solo espacios. | `{"message":"Password is required"}` |
| HTTP 401 | Usuario inexistente o contraseña incorrecta. El mensaje incluye el username enviado. | `{"message":"Invalid user unknown or password"}` |
| HTTP 500 | Una excepción no controlada llega al mapper de autenticación. Los detalles se registran en el servidor, no se devuelven al cliente. | `{"message":"Internal server error"}` |

Evidencia: `auth/src/main/java/com/bcp/workshop/auth/AuthResource.java:26-43`,
`auth/src/main/java/com/bcp/workshop/auth/AuthResource.java:60-64` y
`auth/src/main/java/com/bcp/workshop/auth/AuthExceptionMapper.java:8-19`.

**Preguntas abiertas sobre errores del framework:** el recurso consume JSON,
pero el código no caracteriza el status ni el cuerpo para JSON malformado o un
`Content-Type` no soportado. No se promete aquí un formato para esas respuestas;
verificarlo en ejecución antes de que un consumidor dependa de él.

### 6. Notas de seguridad

- El token es un JWT firmado con la clave configurada en
  `AUTH_JWT_PRIVATE_KEY`; la verificación usa `AUTH_JWT_PUBLIC_KEY`. El código
  incluye `iss=ai-labs-auth`, `sub=username`, el rol como `groups` y una
  expiración real de una hora. `expiresIn` también informa 3600 segundos.
- La configuración de las claves tiene valores predeterminados vacíos. Deben
  configurarse antes de usar el login fuera de pruebas; no se incluyen claves
  reales en este documento.
- CORS está habilitado y su valor predeterminado permite cualquier origen
  (`/.*/`). La allowlist sigue pendiente según H-AUTH-05.
- El usuario y contraseña del ejemplo son credenciales ficticias de taller
  sembradas por el repositorio. No deben utilizarse como credenciales de
  producción.
- El repositorio configura HTTP en el puerto 8080; no se documenta TLS en el
  código de `auth/`. Para despliegues fuera del entorno local, el transporte
  seguro debe confirmarse en la configuración de infraestructura.

**Evidencia:** claims y expiración en
`auth/src/main/java/com/bcp/workshop/auth/TokenService.java:11-20`; claves y
CORS en `auth/src/main/resources/application.properties:5,10-12`; respuesta y
validaciones en `auth/src/main/java/com/bcp/workshop/auth/AuthResource.java:14-64`.
