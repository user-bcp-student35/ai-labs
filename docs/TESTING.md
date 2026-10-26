# Pruebas de endpoints — auth

Esta evidencia cubre los endpoints de `auth/` descritos en
[`ENDPOINTS.md`](./ENDPOINTS.md). Se mantienen los contratos observados y no se
añaden expectativas para los comportamientos que ese documento deja abiertos.
El código ejecutable está en los archivos de prueba del componente.

## Matriz de casos

| endpoint | caso | tipo | resultado esperado |
|---|---|---|---|
| `GET /q/health` | `reportsHealthyStatus` | Camino feliz | HTTP 200 y `status=UP`. |
| `GET /q/health` | `reportsNoHealthChecksWithoutAuthorization` | Borde: sin checks registrados ni header de autorización | HTTP 200 y `checks=[]`. |
| `GET /q/health` | Estado `DOWN` del proveedor | Pendiente, no es respuesta de error definida por `auth/` | No se fija status ni cuerpo hasta verificar un check `DOWN` en ejecución. |
| `POST /auth/login` | `logsInWithWorkshopUserAndReturnsObservedResponse` | Camino feliz | HTTP 200; token no vacío; `expiresIn=3600`; datos de usuario y campo `debug` esperados. |
| `POST /auth/login` | `logsInWhenOptionalClientFieldIsAbsent` | Borde: omite `client`, que es opcional | HTTP 200 y usuario autenticado. |
| `POST /auth/login` | `rejectsNullRequestBody` | Error: cuerpo `null` | HTTP 400, `{"message":"Request is null"}`. |
| `POST /auth/login` | `rejectsMissingUsernameField` | Error: falta `username` | HTTP 400, `{"message":"Username is required"}`. |
| `POST /auth/login` | `rejectsNullUsername`, `rejectsBlankUsername` | Error: `username` nulo o en blanco | HTTP 400, `{"message":"Username is required"}`. |
| `POST /auth/login` | `rejectsMissingPasswordField` | Error: falta `password` | HTTP 400, `{"message":"Password is required"}`. |
| `POST /auth/login` | `rejectsNullPassword`, `rejectsBlankPassword` | Error: `password` nula o en blanco | HTTP 400, `{"message":"Password is required"}`. |
| `POST /auth/login` | `rejectsInvalidCredentials` | Error: usuario inexistente | HTTP 401, `{"message":"Invalid user unknown or password"}`. |
| `POST /auth/login` | `rejectsIncorrectPasswordForExistingUser` | Error: contraseña incorrecta | HTTP 401, mensaje genérico con el username enviado. |
| `POST /auth/login` | `returnsGenericServerErrorWhenAuthenticationThrowsUnexpectedly` | Error: excepción durante autenticación | HTTP 500, `{"message":"Internal server error"}`; no devuelve el detalle de prueba. |
| `POST /auth/login` | JSON malformado o `Content-Type` no soportado | Pendiente, respuesta del framework no fijada en `ENDPOINTS.md` | No se afirma status ni cuerpo; requiere observación y decisión de contrato. |

Los casos de login están en
[`AuthResourceTest.java`](../auth/src/test/java/com/bcp/workshop/auth/AuthResourceTest.java).
El mapper genérico también se prueba unitariamente en
[`AuthExceptionMapperTest.java`](../auth/src/test/java/com/bcp/workshop/auth/AuthExceptionMapperTest.java).

## Código de las pruebas añadidas

Los siguientes métodos están en `AuthResourceTest.java`. El resto de los casos
de la matriz son pruebas existentes en ese mismo archivo; se enlaza el archivo
fuente para evitar mantener una copia divergente de esas pruebas.

### Salud: camino feliz y caso borde

```java
@Test
void reportsHealthyStatus() {
    given()
            .when().get("/q/health")
            .then()
            .statusCode(200)
            .body("status", is("UP"));
}

@Test
void reportsNoHealthChecksWithoutAuthorization() {
    given()
            .when().get("/q/health")
            .then()
            .statusCode(200)
            .body("checks", hasSize(0));
}
```

### Login: campo opcional ausente

```java
@Test
void logsInWhenOptionalClientFieldIsAbsent() {
    given()
            .contentType("application/json")
            .body("{\"username\":\"student\",\"password\":\"Workshop123!\"}")
            .when().post("/auth/login")
            .then()
            .statusCode(200)
            .body("user.username", is("student"))
            .body("token", notNullValue());
}
```

### Login: error 500 a través del endpoint

```java
@Test
void returnsGenericServerErrorWhenAuthenticationThrowsUnexpectedly() {
    AuthService failingAuthService = new AuthService(
            userRepository,
            passwordHasher,
            tokenService
    ) {
        @Override
        public Optional<AuthenticatedUser> authenticate(String username, String password) {
            throw new IllegalStateException("controlled-test-detail");
        }
    };
    QuarkusMock.installMockForType(failingAuthService, AuthService.class);

    given()
            .contentType("application/json")
            .body("{\"username\":\"student\",\"password\":\"Workshop123!\"}")
            .when().post("/auth/login")
            .then()
            .statusCode(500)
            .body("message", is("Internal server error"));
}
```

### Login: campos requeridos ausentes

```java
@Test
void rejectsMissingUsernameField() {
    given()
            .contentType("application/json")
            .body("{\"password\":\"Workshop123!\"}")
            .when().post("/auth/login")
            .then()
            .statusCode(400)
            .body("message", is("Username is required"));
}

@Test
void rejectsMissingPasswordField() {
    given()
            .contentType("application/json")
            .body("{\"username\":\"student\"}")
            .when().post("/auth/login")
            .then()
            .statusCode(400)
            .body("message", is("Password is required"));
}
```

## Ejecución y medición

| fecha | componente | IDs | comando | directorio de ejecución | código de salida | resultado |
|---|---|---|---|---|---:|---|
| 2026-10-26 | auth | H-AUTH-01 a H-AUTH-08 | `mvn verify` | `auth/` | 0 | `BUILD SUCCESS`; 24 pruebas, 0 fallos, 0 errores y 0 omitidas. |

- **Cobertura:** 207 de 221 líneas, **93,7%**.
- **Método:** JaCoCo `LINE` counter, calculado como `covered / (covered +
  missed)` desde `auth/target/site/jacoco/jacoco.xml`; reporte HTML en
  `auth/target/site/jacoco/index.html`.
- La meta mínima de 85% se supera. En este paso solo se modificaron pruebas; el
  porcentaje corresponde a las clases de producción instrumentadas por JaCoCo.
- El test de error 500 registra intencionalmente una excepción de prueba en el
  log del servidor. Ese log `ERROR` es esperado; no representa un fallo del
  test ni se devuelve al cliente.

## Fallos

No hubo fallos ni errores en la ejecución registrada.

## Pendientes

- No se probó una respuesta `DOWN` de `GET /q/health`: el componente no registra
  health checks propios, y su status/cuerpo de error sigue abierto en
  [`ENDPOINTS.md`](./ENDPOINTS.md).
- No se fijaron ni probaron los status y cuerpos de JSON malformado o
  `Content-Type` no soportado en `POST /auth/login`; el documento de endpoints
  los deja como respuestas del framework por confirmar.
- CodeQL y Dependency Review remotos no forman parte de `mvn verify` y no se
  ejecutaron en esta validación.

## Pruebas propuestas

Cuando se confirme en ejecución y se acuerde el contrato del health `DOWN` o de
los errores del framework, agregar pruebas de integración para esos status y
cuerpos exactos. No se incorporan ahora para evitar convertir un comportamiento
no verificado en contrato.
