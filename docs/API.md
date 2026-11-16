# API propia v1

Bearer del propietario en todas las rutas salvo `/`, assets estáticos, `/api/v1/health/live` y webhook firmado opcional. Sin CORS abierto. Un único propietario; no se ofrece multiusuario.

| Ruta | Uso |
| --- | --- |
| GET /health/live, /health/ready | Proceso y disponibilidad de DB/configuración del modelo |
| GET /capabilities, /agents | Capacidades reales y perfiles |
| POST /requests | `{source,externalId,name,objective,tokenLimit,planAutomatically?}`. Idempotencia por source/externalId; conflicto si cambia contenido. Plan automático por defecto. Proyecto pausado. |
| GET /projects, /projects/:id | Lista y snapshot consistente con cursor |
| POST /projects/:id/plans | Plan del SDD, revisión secuencial; requiere cerrar plan anterior |
| POST /plans/validate | Validación pura, sin efectos |
| POST /projects/:id/pause, /resume | Pausa o reanuda nuevos despachos |
| POST /projects/:id/budget | `{expectedTokenLimit,tokenLimit}`; CAS; no reducir por debajo del uso/reserva |
| GET /tasks/:id | Tarea, intentos/checkpoints, artefactos y aprobaciones |
| POST /tasks/:id/review | `{version,decision:accept|reject,evidence,defects?}`; aceptación del coordinador registra propuesta válida |
| POST /tasks/:id/cancel | `{version}`; propaga a descendientes |
| POST /tasks/:id/retry | `{version,reconciled:true,evidence}`; requiere comprobar efectos anteriores |
| POST /tasks/:id/input | `{version,content}`; responde waiting_input |
| GET /projects/:id/sessions, /sessions/:id | Historial nativo por intento |
| POST /approvals/:id/resolve | `{version,actionHash,decision:approved|denied}` |
| GET /artifacts/:id | Descarga autorizada; checksum en header |
| GET/POST /projects/:id/memories | Consulta o `{key,content,source,expectedRevision,expiresAt?}` |
| GET /projects/:id/messages, /audit | Colaboración y auditoría |
| GET/POST /projects/:id/automations | Crear con `{name,timezone,intervalSeconds,plan}`; inicialmente pausada |
| POST /automations/:id/pause, /resume | Control de futuras ocurrencias |
| GET /events?cursor=0&projectId=... | Lotes de hasta 100; repetir con cursor retornado |
| GET /events?cursor=0&stream=true | SSE reanudable con cursor explícito y heartbeat; fetch con Bearer |
| POST /webhook | Entrada HMAC opcional, independiente del token del propietario |

Todas las rutas de la tabla comienzan con `/api/v1`. Mutaciones rechazan campos inesperados. 401 sin credencial, 404 inexistente, 409 conflicto de estado/versión, 422 entrada inválida, 413 tamaño y 503 dependencia caída. El límite general de cuerpo es 128 KiB; artefactos de texto hasta 100 kB.

## Webhook

Configurar WEBHOOK_SECRET distinto del token del propietario (>=32 caracteres). Payload: `{eventId,name,objective,tokenLimit}`. Headers `x-webhook-timestamp`: Unix seconds y `x-webhook-signature`: `sha256=<hex>`. Firma HMAC-SHA256 de `timestamp + '.' + JSON.stringify(payload)` con serialización compacta JS y el mismo orden de propiedades. Ventana +/-300 s. Sin timestamp vigente/firma válida devuelve 403. `eventId` deduplica aunque se firme de nuevo. Recibe rápido y retorna 202; siempre crea proyecto pausado, sin inferencia síncrona.

## Sesiones y autoridad

El ID de sesión propio coincide con el ID de intento. Las nuevas correcciones crean otro intento y conservan los anteriores. Las aprobaciones agregan una decisión al contexto del siguiente intento; no habilitan herramientas nuevas ni representan una ejecución remota. El número de intentos incluye correcciones y continuaciones; máximo inicial tres. Se debe reconciliar una interrupción antes de retry.
