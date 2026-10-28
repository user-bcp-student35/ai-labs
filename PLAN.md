# Plan de corrección — auth

### aprobacion humana
- Ricardo
- 2026/10/26
- H-AUTH-01, H-AUTH-02, H-AUTH-03, H-AUTH-04, H-AUTH-05, H-AUTH-06, H-AUTH-07, H-AUTH-08

## Alcance y selección

Se incluyen todos los hallazgos auth que aparecen como `Pendiente` en
`HALLAZGOS.md`: H-AUTH-01 a H-AUTH-08. La aprobación humana de Ricardo para
esos IDs está registrada arriba. La prueba de caracterización previa se registra
en la sección de ejecuciones.

## Contrato observado que se debe preservar

`docs/ENDPOINTS.md` no existe. El contrato disponible se observa en
`auth/src/main/java/com/bcp/workshop/auth/AuthResource.java` y en la prueba
actual `auth/src/test/java/com/bcp/workshop/auth/AuthResourceTest.java`:

- `POST /auth/login` consume y produce JSON; el request contiene `username`,
  `password` y admite `client`.
- Request nulo o username/password ausentes o en blanco: HTTP 400 con
  `message`.
- Credenciales inválidas: HTTP 401 con `message`.
- Login válido: HTTP 200 con `token`, `expiresIn`, `user` (username,
  displayName, role) y `debug`.
- El token actual codifica una expiración de una hora. El nuevo token debe
  seguir siendo un string en la misma propiedad `token`; `expiresIn` y la
  forma de `user` también se conservan.

Estos son comportamientos observados, no un contrato acordado. No se cambiarán
silenciosamente los status, nombres de propiedades ni la forma de las respuestas.
La exposición de detalles de error y el campo de diagnóstico se tratarán como
riesgos de seguridad, no como requisitos para conservar datos sensibles.

## Secuencia de trabajo propuesta

1. Escribir y ejecutar las pruebas de caracterización descritas abajo antes de
   modificar código o configuración; registrar sus resultados reales.
2. Resolver las decisiones externas pendientes: revisar advisories de
   dependencias y obtener la lista de orígenes CORS autorizados. No inventar
   versiones ni una allowlist.
3. Aplicar las correcciones en cambios revisables, siguiendo H-AUTH-07 para
   separar Resource, Service, Repository y seguridad. Coordinar H-AUTH-01 y
   H-AUTH-02 en la persistencia y H-AUTH-03 y H-AUTH-05 en token/configuración.
4. Ejecutar pruebas de regresión y revisar la cobertura del código modificado
   contra la meta de 85%; no reducir ni silenciar CodeQL, Dependency Review o
   JaCoCo.

## H-AUTH-01 — Contraseñas almacenadas en texto plano

- **Problema:** `LegacyDatabase` siembra y consulta contraseñas sin hash.
- **Cambio propuesto:** almacenar un hash lento con salt aleatorio y parámetros
  identificables, usando una implementación mantenida (por ejemplo BCrypt, como
  permite `docs/GOOD_PRACTICES.md`). Convertir las credenciales de prueba al
  formato hash y diseñar una migración idempotente para las filas existentes;
  verificar la contraseña en el servicio sin registrar el secreto. Mantener las
  credenciales ficticias y el resultado HTTP de login.
- **Archivos a tocar:** `auth/src/main/java/com/bcp/workshop/auth/LegacyDatabase.java`;
  nueva clase de hash/servicio bajo `auth/src/main/java/com/bcp/workshop/auth/`;
  `auth/src/test/java/com/bcp/workshop/auth/AuthResourceTest.java` y pruebas
  unitarias del hash/persistencia bajo `auth/src/test/java/`.
- **Caracterización antes de tocar código:** ampliar `AuthResourceTest` para
  fijar el login válido del usuario de taller y la respuesta 401 de credenciales
  inválidas. Añadir una prueba de persistencia que registre el comportamiento de
  login con los datos semilla, sin fijar el almacenamiento inseguro como
  expectativa futura. Después de la migración, comprobar que el login sigue
  aceptando la contraseña ficticia y que el valor persistido no es la contraseña
  original.

## H-AUTH-02 — Concatenación de credenciales en SQL

- **Problema:** `findByCredentials` interpola valores recibidos dentro del SQL.
- **Cambio propuesto:** usar `PreparedStatement` y parámetros enlazados. En
  coordinación con H-AUTH-01, consultar el usuario por username y verificar el
  hash fuera del SQL, sin incluir la contraseña en la consulta.
- **Archivos a tocar:** `auth/src/main/java/com/bcp/workshop/auth/LegacyDatabase.java`
  (o el Repository que se extraiga en H-AUTH-07); pruebas del Repository en
  `auth/src/test/java/com/bcp/workshop/auth/`.
- **Caracterización antes de tocar código:** fijar mediante pruebas el login
  válido y el rechazo 401 de un par de credenciales no coincidente. Tras el
  cambio, añadir la prueba de que entradas ordinarias que no identifican una
  cuenta no autentican ni alteran la búsqueda; no conservar la concatenación
  como comportamiento esperado.

## H-AUTH-03 — Token Base64 con secreto embebido y sin firma verificable

- **Problema:** Base64 no aporta integridad; el formato actual incluye el secreto
  en el texto codificado y no demuestra que sus claims sean auténticos.
- **Cambio propuesto:** emitir un token firmado con claims explícitos de username
  y role, y expiración. Preferir una API JWT mantenida y compatible con la
  plataforma Quarkus; justificar y verificar en el BOM cualquier dependencia
  nueva antes de añadirla. La clave de firma se configurará externamente según
  H-AUTH-05, con material de prueba aislado. Conservar `token` como string y
  `expiresIn` en la respuesta.
- **Configuración operativa:** para ejecutar login fuera del perfil de pruebas,
  configurar `AUTH_JWT_PRIVATE_KEY` y `AUTH_JWT_PUBLIC_KEY` con rutas a la pareja
  de claves correspondiente. La pareja incluida en `auth/src/test/resources/`
  es exclusivamente de pruebas; no se incorporó ninguna clave real.
- **Archivos a tocar:** `auth/src/main/java/com/bcp/workshop/auth/LegacyTokenUtil.java`
  (o clase de seguridad con nombre acorde a su responsabilidad);
  `auth/src/main/resources/application.properties`;
  `auth/pom.xml` solo si la API elegida no está disponible y la dependencia queda
  justificada; pruebas nuevas bajo `auth/src/test/java/com/bcp/workshop/auth/`.
- **Caracterización antes de tocar código:** ampliar `AuthResourceTest` para
  registrar status 200 y la forma/tipos de `token`, `expiresIn` y `user`, sin
  depender de los bytes Base64 actuales. Después, probar que una firma válida y
  una expiración vigente se aceptan en la utilidad, y que la firma alterada o la
  expiración vencida se rechazan.

## H-AUTH-04 — La respuesta expone detalles de excepción

- **Problema:** el manejo de errores HTTP devuelve el mensaje y la clase de la
  excepción al cliente.
- **Cambio propuesto:** responder con un mensaje genérico y status 500, y enviar
  el detalle únicamente al logger del servidor. Evitar capturar excepciones
  amplias dentro de métodos que también hacen validación o acceso a datos;
  ubicar la traducción de errores en el límite HTTP tras la separación de capas
  de H-AUTH-07.
- **Archivos a tocar:** `auth/src/main/java/com/bcp/workshop/auth/AuthResource.java`
  y, según la separación, el manejador de errores/logger en
  `auth/src/main/java/com/bcp/workshop/auth/`; pruebas bajo
  `auth/src/test/java/com/bcp/workshop/auth/`.
- **Caracterización antes de tocar código:** con un doble controlado de la capa
  de negocio que provoque una excepción, registrar el status 500 y la estructura
  actual del error. Al implementar la corrección, cambiar la expectativa para
  exigir mensaje genérico y ausencia de mensaje/clase internos en JSON; verificar
  que el detalle solo se registra en servidor.

## H-AUTH-05 — Secreto embebido y CORS hardcodeado

- **Problema:** el secreto del token está en Java y CORS permite cualquier
  origen por una expresión universal.
- **Cambio propuesto:** externalizar la clave de firma y los orígenes permitidos
  mediante configuración Quarkus/variables de entorno, sin introducir secretos
  reales. No inventar la allowlist: hasta que se acuerden orígenes autorizados,
  mantener explícito el valor efectivo observado como riesgo pendiente y no
  cambiar silenciosamente el comportamiento CORS. La configuración final debe
  permitir restringir CORS a la allowlist aprobada.
- **Archivos a tocar:** `auth/src/main/resources/application.properties`,
  `auth/src/main/java/com/bcp/workshop/auth/LegacyTokenUtil.java` o la clase de
  seguridad de H-AUTH-03, y pruebas de configuración bajo `auth/src/test/java/`.
- **Caracterización antes de tocar código:** añadir una prueba HTTP que registre
  los encabezados CORS para una solicitud con `Origin`, junto con pruebas que
  fijen el login válido y la presencia del token en la respuesta. Tras acordar
  la allowlist, comprobar origen permitido y origen no permitido; no dar por
  aprobada una allowlist en este plan.

## H-AUTH-06 — Dependencias Quarkus 3.27.4 y Commons Text 1.9

- **Problema:** ambas versiones están fijadas en el POM; la presencia está
  confirmada. La investigación del 2026-10-26 confirmó CVE-2026-50559 para
  Quarkus 3.27.4, corregido en la rama 3.27 con 3.27.4.1 y 3.27.5; también
  confirmó CVE-2022-42889 para Commons Text 1.9, corregido desde 1.10.0. Apache
  especifica que la exposición de CVE-2022-42889 requiere uso inseguro de
  `StringSubstitutor`; auth usa `StringEscapeUtils`, pero actualizar sigue
  eliminando la versión afectada.
- **Cambio propuesto:** actualizar Quarkus a 3.27.5 y Commons Text a 1.15.0,
  versión estable más reciente listada por Apache al investigar. No silenciar
  alertas. CodeQL y Dependency Review remotos quedan fuera de este recorrido y
  se registrarán como no ejecutados.
- **Archivos a tocar:** `auth/pom.xml` solo si la investigación justifica el
  cambio; `auth/src/main/java/com/bcp/workshop/auth/AuthResource.java` solo si
  se retira Commons Text y se reemplaza su uso de escape HTML; pruebas de
  autenticación en `auth/src/test/java/com/bcp/workshop/auth/AuthResourceTest.java`.
- **Caracterización antes de tocar código:** ejecutar la prueba existente
  `logsInWithWorkshopUser` y ampliar la caracterización del JSON de éxito antes
  de cualquier cambio de dependencia o de escape de respuesta. Se ejecutó la
  caracterización antes de actualizar dependencias; comprobar compilación y
  regresión con las versiones objetivo después del cambio.
- **Evidencia de advisories:** [Quarkus GHSA-qcxp-gm7m-4j5v](https://github.com/quarkusio/quarkus/security/advisories/GHSA-qcxp-gm7m-4j5v);
  [Quarkus 3.27.5 release](https://quarkus.io/blog/quarkus-3-27-5-released/);
  [Apache Commons Text security reports](https://commons.apache.org/proper/commons-text/security.html);
  [Apache Commons Text releases](https://downloads.apache.org/commons/text/).

## H-AUTH-07 — Resource mezcla validación, negocio, persistencia y respuesta

- **Problema:** `AuthResource.login` concentra todas esas responsabilidades y
  usa condicionales profundamente anidados.
- **Cambio propuesto:** separar Resource (HTTP/validación de entrada y mapping de
  respuesta), Service (autenticación/reglas), Repository (consultas y
  persistencia) y seguridad (hash/token), con métodos de una sola
  responsabilidad, nombres de propósito, guard clauses y sin duplicar reglas.
  Centralizar valores de expiración y otros valores constantes con nombres
  explícitos. No devolver directamente el record de persistencia; mapear la
  salida al DTO de respuesta.
- **Archivos a tocar:** `auth/src/main/java/com/bcp/workshop/auth/AuthResource.java`,
  `LegacyDatabase.java`, `LegacyTokenUtil.java`, `UserRecord.java` solo si su
  responsabilidad cambia, y nuevas clases Service/Repository/DTO en
  `auth/src/main/java/com/bcp/workshop/auth/`; pruebas en
  `auth/src/test/java/com/bcp/workshop/auth/`.
- **Caracterización antes de tocar código:** completar primero pruebas de
  `AuthResourceTest` para request nulo, username/password nulos o en blanco,
  login válido (incluyendo todas las propiedades observadas de la respuesta) y
  credenciales inválidas. Preservar status, nombres y tipos de campos al mover
  lógica a las capas.

## H-AUTH-08 — Contrato observado sin contrato acordado

- **Problema:** falta `docs/ENDPOINTS.md`; el comportamiento observado existe,
  pero no hay evidencia de que esté acordado formalmente.
- **Cambio propuesto:** usar la caracterización de H-AUTH-07 como base y
  registrar en `docs/ENDPOINTS.md` el contrato observado de `POST /auth/login`,
  distinguiéndolo de cualquier decisión aún no aprobada. No alterar el
  comportamiento HTTP mientras no exista acuerdo explícito.
- **Archivos a tocar:** `auth/src/test/java/com/bcp/workshop/auth/AuthResourceTest.java`
  y `docs/ENDPOINTS.md`. Este paso solo planifica; no crea el documento ni
  modifica código.
- **Caracterización antes de tocar código:** antes de cambios de producción,
  comprobar con pruebas los cuatro grupos de entrada/salida descritos en
  “Contrato observado que se debe preservar”: validaciones 400, credenciales
  inválidas 401, login válido 200 y forma del JSON de respuesta.

## Validación prevista

Desde `auth/`, ejecutar `mvn test` para la caracterización previa y las pruebas
de regresión posteriores. Ejecutar `mvn verify` después de los cambios para
generar el informe JaCoCo configurado en el proyecto.

## Registro de ejecuciones

| fecha | componente | IDs | fase / comando (cwd) | resultado |
|---|---|---|---|---|
| 2026-10-26 | auth | H-AUTH-01 a H-AUTH-08 | Caracterización previa — `mvn test` (`auth/`) | PASS: 7 pruebas; 0 fallos, 0 errores, 0 omitidas. `AuthResourceTest`: 6; `AuthResourceErrorCharacterizationTest`: 1. |
| 2026-10-26 | auth | H-AUTH-01 a H-AUTH-08 | Primera compilación después de cambios — `mvn test` (`auth/`) | FAIL antes de ejecutar pruebas: la prueba importaba el tipo incorrecto `ParseException`; corregido. |
| 2026-10-26 | auth | H-AUTH-01, H-AUTH-02, H-AUTH-07 | Prueba de persistencia — `mvn test` (`auth/`) | FAIL: 14 pruebas, 1 error por driver SQLite no cargado en la prueba unitaria; se añadió carga explícita del driver en el test. |
| 2026-10-26 | auth | H-AUTH-01 a H-AUTH-08 | Caracterización y primeras correcciones — `mvn test` (`auth/`) | PASS: 14 pruebas; 0 fallos, 0 errores, 0 omitidas. |
| 2026-10-26 | auth | H-AUTH-01 a H-AUTH-08 | Primera cobertura — `mvn verify` (`auth/`) | BUILD SUCCESS, 14 pruebas; JaCoCo 178/210 líneas (84,8%), bajo la meta; se añadió cobertura directa del servicio. |
| 2026-10-26 | auth | H-AUTH-01 a H-AUTH-08 | Cobertura de servicio — `mvn verify` (`auth/`) | BUILD SUCCESS, 16 pruebas; JaCoCo permaneció en 84,8% porque la prueba Quarkus no contabilizó líneas del servicio; se cambió a una prueba unitaria JUnit aislada. |
| 2026-10-26 | auth | H-AUTH-03 | Validación de token — `mvn verify` (`auth/`) | FAIL: 16 pruebas, la alteración del último carácter Base64 no cambiaba los bytes de firma; el test se corrigió para alterar el primer carácter de firma. |
| 2026-10-26 | auth | H-AUTH-01 a H-AUTH-08 | Regresión — `mvn verify` (`auth/`) | PASS: 16 pruebas; JaCoCo 192/210 líneas (91,4%). |
| 2026-10-26 | auth | H-AUTH-01 a H-AUTH-08 | Regresión final — `mvn verify` (`auth/`) | PASS: 18 pruebas; JaCoCo 207/221 líneas (93,7%). Todas las clases de producción modificadas alcanzan al menos 91,3%. |
| 2026-10-26 | auth | H-AUTH-01 a H-AUTH-08 | Verificación final tras renombrar prueba — `mvn verify` (`auth/`) | PASS: 18 pruebas; 0 fallos, 0 errores, 0 omitidas; BUILD SUCCESS; JaCoCo 207/221 líneas (93,7%). |
| 2026-10-26 | auth | H-AUTH-03, H-AUTH-06 | Resolución de dependencias — `mvn dependency:tree` con varios filtros (`auth/`) | FAIL: Maven rechazó el filtro combinado; se repitió con filtros individuales. |
| 2026-10-26 | auth | H-AUTH-06 | Resolución de Commons Text — `mvn dependency:tree -Dincludes=org.apache.commons:commons-text` (`auth/`) | PASS: resuelve `commons-text:1.15.0`. |
| 2026-10-26 | auth | H-AUTH-03, H-AUTH-06 | Resolución de JWT — `mvn dependency:tree -Dincludes=io.quarkus:quarkus-smallrye-jwt` (`auth/`) | PASS: resuelve `quarkus-smallrye-jwt:3.27.5`. |

CodeQL y Dependency Review remotos: no ejecutados en este recorrido local.

## Resultado por hallazgo

- **Resueltos:** H-AUTH-01 (hash y migración), H-AUTH-02 (consulta
  parametrizada), H-AUTH-03 (JWT firmado con claims y expiración), H-AUTH-04
  (error genérico y detalle solo en log), H-AUTH-06 (versiones actualizadas con
  evidencia de advisory) y H-AUTH-07 (capas, DTOs y responsabilidades separadas).
- **Pendiente:** H-AUTH-05. Clave de firma y CORS ahora son configurables; se
  conservó `/.*/` como valor predeterminado para no inventar ni cambiar una
  allowlist sin aprobación. Una lista de orígenes autorizados sigue pendiente.
- **Pendiente:** H-AUTH-08. La caracterización confirma el contrato observado,
  pero `docs/ENDPOINTS.md` no se creó porque su paso de documentación aún no fue
  solicitado.

JaCoCo se generó en `auth/target/site/jacoco/index.html`. CodeQL y Dependency
Review remotos no se ejecutaron. La cobertura final es 207/221 líneas (93,7%).

## Implementacion H-AUTH-09 a H-AUTH-11 2026-10-27

- **Aprobación:** se aprobaron H-AUTH-09, H-AUTH-10 y H-AUTH-11 para
  implementación. No se proporcionó un número de Issue de GitHub.
- **Decisiones:** sembrar cuentas solo cuando `AUTH_SEED_ENABLED=true`; crear
  esa variable explícitamente en el flujo local del taller, Compose y pruebas.
  La configuración general predeterminada es `false`. Las filas existentes no
  se eliminan al deshabilitar el sembrado.
- **Estrategia:** conservar `POST /auth/login` y verificar un hash de relleno
  con el mismo `PasswordHasher` cuando el usuario no existe; mapear JSON
  malformado a 400 y tipo de contenido no soportado a 415, ambos con JSON
  `message`. Las excepciones inesperadas mantienen el 500 genérico.
- **Validación real:** `python tools/lab.py test auth` — `BUILD SUCCESS`, 29
  pruebas, 0 fallos, 0 errores y 0 omitidas. JaCoCo para las tres clases de
  producción modificadas: 153/164 líneas (93,3%).
- **Riesgo residual:** no se ejecutó una comparación estadística de latencias;
  la prueba confirma la ruta de verificación del hash de relleno, pero no
  demuestra equivalencia temporal. CodeQL y Dependency Review remotos tampoco
  se ejecutaron.
