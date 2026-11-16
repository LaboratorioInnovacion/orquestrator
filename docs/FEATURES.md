# Estado funcional — SDD 3.0

Esta matriz distingue implementación local de validación con un modelo real. El objetivo completo no se declara terminado.

| Capacidad | Implementación | Evidencia / límite |
| --- | --- | --- |
| Perfiles de agentes | Coordinator/researcher/executor/reviewer con misión y catálogo | Código propio; perfiles estáticos |
| Planificación | Objetivo crea coordinador; propose_plan valida y publica DAG | Proveedor determinista local; aceptación humana registra plan |
| Sesiones | Intento, historial, herramientas, checkpoints y consulta | PostgreSQL real; no se conserva razonamiento privado |
| Delegación | Coordinador propone tareas; scheduler central despacha | DAG; no árbol ilimitado de subagentes |
| Paralelismo | Transacción con lock global; límites 3/2 | Claims concurrentes probados con PostgreSQL |
| Dependencias | Esperan aceptación; fallo bloquea descendientes | Fan-in/fan-out probados |
| Revisión | Propietario registra evidencia/defectos; máximo 3 intentos | CAS por versión, decisiones concurrentes probadas |
| Comunicación | Mensajes/handoffs correlacionados y preguntas al propietario | Handoff informa contexto; no reasigna por sí solo |
| Contexto | Dependencias aceptadas, revisión, decisiones y mensajes | Límite de contexto y presupuesto; sin compactación automática |
| Memoria | Proyecto, procedencia, revisiones, expiración y corrección | Sin índice vectorial ni memoria global de usuario |
| Herramientas | Lectura/escritura de textos en DB, memoria, mensajes, planes | Sin filesystem host, shell, navegador ni plugins instalables |
| Modelos | Chat Completions con tools, URL/modelo configurados en servidor | Contrato HTTP probado; proveedor real pendiente; sin fallback automático |
| Automatizaciones | Intervalos, pausa, deduplicación, skip de solapamientos | Sin calendario cron ni múltiples zonas de calendario |
| Ingreso externo | Webhook HMAC/timestamp y pedido idempotente | Requiere secreto propio; proyecto empieza pausado |
| Canales | Web y API propia | Telegram/email/etc. no implementados |
| Archivos | Artefactos de texto aislados, checksum y descarga por ID | Sin archivos binarios, navegador ni multimedia |
| ACP y dispositivos | Deshabilitados | No implementados |
| Aprobaciones | Acción/hash/versión/expiración y resolución única | No ejecuta por sí misma acciones externas inexistentes |
| Panel | Objetivos, tareas, entregables, aceptación, cancelación, retry | Probado en Chromium a 390px; actualización manual de tareas |
| Eventos | Log durable con cursor; SSE y snapshots consistentes | Sin expiración/retención automática ni broker externo |
| Auditoría | Acciones de propietario con objeto y fecha | Sin exportación/cifrado específico |
| Presupuesto | Tokens globales por proyecto, reserva antes de llamada | Uso desconocido estimado; sin coste monetario, daily reset ni ajuste desde panel |
| Fallos | Lease/checkpoint, estado ambiguo, retry explícito reconciliado | No prometer exactamente una vez; no relanzar por timeout |
| Operación | Compose privado, CI, migraciones checksum, backup y restore aislado | Sin CD automático, alertas externas, HA ni prueba 24 h |

Los límites avanzados del documento original no se habilitan por analogía con OpenClaw. Falta implementar y probar cada integración antes de declararla soportada.
