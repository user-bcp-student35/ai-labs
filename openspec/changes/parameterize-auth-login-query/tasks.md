# Tasks

## 1. Caracterizar el contrato de login

- [x] 1.1 Completar `AuthResourceTest` para comprobar que las credenciales válidas conservan el contrato de éxito existente; verificar con `mvn -Dtest=AuthResourceTest test` desde `auth/`.
- [x] 1.2 Agregar casos de login usando `' OR '1'='1` como username y como password, esperando HTTP 401 y ausencia de `token`; ejecutar `mvn -Dtest=AuthResourceTest test` antes del cambio funcional y confirmar que ambos casos reproducen el bypass mientras el caso válido sigue pasando.

## 2. Parametrizar la búsqueda de credenciales

- [x] 2.1 Cambiar únicamente `LegacyDatabase.findByCredentials` para usar una sentencia preparada con username y password enlazados como parámetros; verificar con `mvn -Dtest=AuthResourceTest test` que el login válido sigue pasando y ambos casos de inyección devuelven HTTP 401 sin token.

## 3. Validar el componente auth

- [x] 3.1 Ejecutar `mvn verify` desde `auth/` y confirmar que todas las pruebas pasan, JaCoCo genera el reporte y el código modificado alcanza al menos 85% de cobertura.
