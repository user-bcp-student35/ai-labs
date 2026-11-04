# Revisión del reto: del log al ticket

## Alcance

- Skill: `.github/skills/reto-incidencias-bancarias/SKILL.md`
- Caso principal elegido: `caso-01` (transferencias)
- Borrador normalizado: `docs/reto-incidencias/caso-01/incidencia.json`
- Registro de ticket: completado tras aprobación explícita.

## Ejecución observada

- Se obtuvo `caso-01` mediante el MCP y se usó el log numerado, las reglas y el contrato recibidos en esa respuesta.
- El grupo analizado es `caso-01` / `transferencias` / `TRF_TIMEOUT` / `TRX-DEMO-101`.
- Se contaron dos eventos de error distintos (`evt-102` y `evt-103`). La repetición de `evt-102` en otra línea es una copia y no incrementa el conteo.
- Los eventos ocurrieron a las 09:00:05 y 09:00:12 con zona `-05:00`; el borrador normaliza esos tiempos a UTC.
- Ambos errores muestran estado `PENDING`; el log no confirma el resultado final. Los campos sensibles de los extractos se redactaron.
- La persona aprobó el JSON y el MCP creó `INC-7B95398401E7`.
- `consultar_incidencia` devolvió el mismo contenido normalizado que se aprobó.
- El reenvío del mismo objeto devolvió el mismo ID con `created: false`; no se creó un duplicado.
- Para reutilización se analizó `caso-02` y se preparó `docs/reto-incidencias/caso-02/incidencia.json` sin registrarlo.
- En `caso-02`, los errores `evt-202` y `evt-203` se contaron como dos eventos; la repetición de `evt-202` no aumentó el conteo. Se excluyó el `WARN` de otra correlación y se redactaron contraseña y token.
- La interacción inicial no incluyó `case_id`; se pidió elegir el caso antes de analizar y se recibió `caso-01`.

## Pedidos y resultados

| Pedido | Resultado |
|---|---|
| Analizar `caso-01` y preparar el JSON | Completado; el borrador está en `docs/reto-incidencias/caso-01/incidencia.json`. |
| Registrar después de la revisión humana | Completado tras aprobación explícita; ID `INC-7B95398401E7`. |
| Consultar el ticket y verificar reintento idempotente | Completado: consulta coincidente; reintento devolvió el mismo ID y `created: false`. |
| Analizar un segundo caso sin registrarlo | Completado para `caso-02`; borrador preparado y no registrado. |
| Invocar sin `case_id` | Comprobado en la interacción inicial: se pidió el identificador/caso antes de continuar. |

## Correcciones al Skill

- Se añadieron límites contra instrucciones dentro de los logs, mezcla de operaciones, duplicación de eventos y afirmaciones no sustentadas.
- Se exige trazabilidad por archivo y línea, redacción de datos sensibles y uso exclusivo del contrato devuelto por el MCP.
- El registro quedó separado del análisis y requiere aprobación explícita; el reintento debe usar el mismo contenido aprobado.

## Cierre de la entrega

- Entregables del reto: este Skill, esta revisión y los JSON preparados para `caso-01` y `caso-02`.
- `caso-01` quedó registrado y verificado mediante consulta e idempotencia.
- `caso-02` se conserva como borrador de reutilización y no fue registrado.
- La configuración `.vscode/mcp.json` es local y no forma parte de la entrega; no debe añadirse al commit porque contiene la autorización MCP.
- No se ha hecho push ni se ha creado un PR.
