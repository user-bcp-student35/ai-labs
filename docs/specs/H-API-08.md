# Bytes no UTF-8 del servicio de salud no deben causar un 500

## Fuente

- Hallazgo: `HALLAZGOS.md`, H-API-08, “Bytes no UTF-8 del servicio de salud pueden causar 500”.
- Estado en el registro: CANDIDATO. Aprobado por el usuario como fuente de esta especificación en la solicitud actual.
- Evidencia: `api/app/routes/backend_health.py:24,30,40`; el manejo de errores de la consulta remota no cubre la decodificación UTF-8. Las pruebas existentes cubren errores de transporte y respuestas UTF-8 válidas (`api/tests/test_api.py:192,208`), pero no bytes inválidos.
- Impacto: una respuesta mal codificada del servicio consultado puede escapar como excepción no controlada y romper la respuesta esperada del endpoint de salud.

## Contexto actual

`GET /api/backend-health` requiere autenticación y consulta el servicio de salud configurado en el servidor. La API devuelve HTTP 200 con `requestedBy`, `status` y `body` cuando procesa la respuesta. Si falla la consulta remota, el contrato documentado establece `status: 0` y `body: "Backend health check failed"`. Una respuesta remota con bytes no válidos para UTF-8 puede producir actualmente un 500; la documentación identifica ese comportamiento como inferido del código.

## Problema confirmado

Una respuesta remota cuyos bytes no se pueden decodificar como UTF-8 puede provocar un 500 no controlado, en vez de una respuesta de error estable del endpoint de salud.

## Comportamiento a preservar

- Mantener `GET /api/backend-health`, su requisito de autenticación y su formato JSON con los campos `requestedBy`, `status` y `body`.
- Para respuestas remotas UTF-8 válidas, conservar el código HTTP remoto y el cuerpo decodificado.
- Ante un fallo de consulta, conservar la respuesta documentada de la API: HTTP 200, `status: 0` y `body: "Backend health check failed"`.
- Mantener la respuesta 401 documentada para tokens inválidos.

## Alcance

- Definir el comportamiento observable del endpoint cuando el backend responde con bytes que no son UTF-8 válidos.
- Verificar que ese caso se representa como un fallo controlado de la consulta y no como un 500 inesperado.
- Verificar que las respuestas válidas y el fallo de transporte mantienen sus comportamientos documentados.

## Fuera de alcance

- Cambios en autenticación, configuración de la URL remota, timeout o autorización.
- Cambios en otros endpoints o en la forma de representar fallos distintos a la decodificación inválida.
- Cambios al contenido o la codificación de las respuestas del servicio remoto.

## Criterios de aceptación

1. Con una solicitud autenticada a `GET /api/backend-health`, si el backend devuelve bytes que no son UTF-8 válidos, la API responde HTTP 200 con JSON válido, `requestedBy` igual a la identidad autenticada, `status` igual a `0` y `body` igual a `"Backend health check failed"`.
2. El caso de bytes no UTF-8 no produce una excepción no controlada ni una respuesta HTTP 500.
3. Si el backend devuelve una respuesta UTF-8 válida, el endpoint sigue respondiendo HTTP 200 y conserva en `status` y `body` el estado y cuerpo remotos.
4. Si falla el transporte, se conserva HTTP 200 con `status: 0` y `body: "Backend health check failed"`.
5. Si el token es inválido, se conserva HTTP 401 con el formato de error documentado.

## Contratos afectados/protegidos

- Contrato de `GET /api/backend-health` documentado en `docs/ENDPOINTS.md`, sección “5. GET /api/backend-health”.
- Contrato del componente API en `AGENTS.md`: conservar endpoints y formatos usados por el frontend.
- Forma de la respuesta exitosa de salud: `requestedBy` (string), `status` (integer) y `body` (string).

## Riesgos, supuestos y preguntas abiertas

- Supuesto para esta especificación: bytes no UTF-8 se tratan como fallo de consulta y usan la misma respuesta documentada que un fallo de transporte. Confirmar esta equivalencia durante la revisión humana.
- La documentación actual describe el 500 por bytes inválidos como una inferencia del código; el criterio de aceptación define explícitamente el comportamiento esperado para eliminar esa ambigüedad.
- No se especifica cómo registrar el error de decodificación; cualquier cambio debe evitar exponer detalles internos en la respuesta al cliente.
