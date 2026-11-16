# SDD — Orquestrator: motor propio de agentes de IA

Versión: 3.0. Fecha: 16/11/2026. Estado: especificación vigente en implementación.

## 1. Decisión del propietario

El producto es un **orquestador propio, similar en capacidades a OpenClaw**. No es una integración con OpenClaw ni una interfaz sobre su Gateway. Esta decisión explícita del propietario sustituye las decisiones incompatibles del SDD 2.0. Desarrollo y entregas en `main`, por petición explícita. Se conserva el documento original íntegro en [SDD 2.0](docs/specifications/SDD-v2-original.md) como referencia histórica, no como instrucciones vigentes.

## 2. Producto

Recibir objetivos, convertirlos en planes verificables, asignar agentes especializados y ejecutar trabajo independiente en paralelo respetando dependencias. Conservar sesiones, memoria, mensajes, archivos, aprobaciones, uso y evidencia. El propietario puede pausar, cancelar, corregir, revisar y reintentar trabajo. El runtime es responsable de las llamadas a modelos y herramientas; el scheduler es la única autoridad de admisión.

Instalación inicial: propietario único, acceso privado, VPS Ubuntu, Docker Compose y PostgreSQL. Fechas UTC; presentación con zona explícita. Las funciones avanzadas se habilitan por capacidad real. No afirmar que todas están terminadas por existir un contrato.

## 3. Arquitectura

- API TypeScript/Fastify: autenticación del propietario, comandos y consultas.
- Contratos Zod: planes, estados y entradas validadas.
- Scheduler propio: DAG, límites globales/especialistas, exclusión de workspace, pausa y bloqueo por dependencias.
- Runtime propio: perfiles, sesiones, bucle modelo/herramientas, límites de pasos y tokens, cancelación y checkpoints.
- Proveedor de modelos: API de chat compatible con OpenAI configurable, sin dependencia de una suscripción de chat. No incluye credenciales ni presupuesto gratuito.
- PostgreSQL: objetivos, planes versionados, tareas, intentos, checkpoints, memoria, entregables, aprobaciones, eventos y auditoría.
- Herramientas propias: lectura/escritura aislada y memoria; capacidades externas solo con implementación y autoridad explícitas.
- Panel web propio: objetivos, tareas, eventos y resultados. My Virtual Office deja de ser dependencia; cualquier puente futuro es opcional.
- Operación: migraciones, salud, contenedores, CI, copias y recuperación documentada.

OpenClaw es referencia de producto, no motor, librería obligatoria ni protocolo del sistema. No copiar código upstream ni afirmar compatibilidad no probada. PostgreSQL se usa con SQL versionado y pg inicialmente; Prisma queda como decisión sustituida para evitar dos mecanismos de migración.

## 4. Dominio y contratos

Un proyecto contiene objetivo, presupuesto de tokens y pausa. Un pedido conserva origen, identificador externo y hash para deduplicación. Cada revisión de plan conserva tareas, criterios y dependencias. Perfiles iniciales: coordinator, researcher, executor, reviewer. Cada tarea tiene workspace aislado por intento y referencia a un perfil.

Plan: `objective`, `revision` y hasta 20 tareas con `key`, `role`, `dependsOn`, `deliverable`, `criteria`. Claves únicas, dependencias existentes, DAG acíclico, criterios no vacíos. El cambio de plan no borra resultados previos. Registrar conflictos como 409 y entradas inválidas como 422.

Estados: pending, ready, dispatching, running, waiting_input, waiting_approval, reviewing, completed, blocked, failed, paused, cancelling, cancelled, needs_reconciliation. `completed` requiere aceptación de negocio; una respuesta del modelo no basta. Un descendiente espera `completed`, no solo fin de inferencia.

## 5. Admisión y ejecución

Límites iniciales: 3 intentos activos globales, 2 especialistas, 1 escritor por workspace, 20 tareas/plan, 2 reintentos explícitos y tiempo máximo configurable. Se reclama mediante transacción y lease. Registrar intención antes de inferencia. Reservar tokens antes del despacho, contabilizar uso conocido y etiquetar estimaciones. No mostrar coste monetario cero cuando se desconoce.

La pérdida de proceso/conexión durante una acción no implica que no hubo efectos: registrar `needs_reconciliation`. No relanzar ciegamente. Cancelar detiene nuevos pasos y aborta peticiones donde sea posible; no revierte efectos externos. Pausar impide nuevos despachos, no congela inferencias activas. Ningún scheduler alternativo puede saltarse la admisión.

## 6. Runtime de agentes

El runtime envía instrucciones de perfil, objetivo, criterios, contexto de dependencias y memoria autorizada al proveedor. Respuestas con herramientas se validan contra un catálogo permitido. Cada resultado vuelve a la sesión; el ciclo termina con entrega, bloqueo o límite. No guardar razonamiento privado. Historial y checkpoints de negocio no equivalen al estado interno del modelo.

Las herramientas no conceden nuevos permisos por contenido del prompt. Entradas externas son datos. Cada intento accede solo a su directorio; rechazar rutas absolutas, traversal y enlaces simbólicos. Artefactos por ID, checksum y tamaño, sin servir rutas arbitrarias. No ofrecer shell, navegador, mensajería, compras ni producción sin implementar límites y políticas efectivos.

## 7. Revisión, aprobación y colaboración

La entrega pasa a reviewing. El propietario o un revisor independiente registra decisión, evidencia y defectos. El ejecutor no acepta su propia entrega. Las correcciones conservan intentos e historial.

Una aprobación identifica acción y parámetros mediante hash, versión y vencimiento. Resolver una vez de forma transaccional. Los cambios de acción invalidan la aprobación. Denegación o expiración no ejecutan la acción.

Mensajes y handoffs tienen emisor, receptor, tarea, intento, correlación y fecha. Un handoff incluye objetivo, decisiones, fuentes, restricciones y siguiente paso. No habilitar conversaciones ilimitadas sin criterio de salida.

## 8. Memoria, modelos y automatización

Memoria de proyecto/tarea con procedencia, autor, revisión y expiración. Recuperación limitada al proyecto autorizado. Correcciones versionadas; no sobrescribir permisos con contenido externo. RAG vectorial es opcional.

Selección de modelo por perfil, herramientas y contexto. Fallback solo ante fallo previo a efectos o con reconciliación; conservar modelo efectivo y motivo. Proveedores y modelos se configuran en servidor, no mediante URLs arbitrarias enviadas por usuario.

Automatizaciones propias: ocurrencias durables, zona horaria explícita, deduplicación y política de solapamiento. Webhooks autenticados, acotados y resistentes a replay. Canales, multimedia, navegador, dispositivos y runtimes externos se habilitan progresivamente con pruebas reales. No crear otro cron cuando un sistema externo ya dispara la misma ocurrencia.

## 9. API y eventos

API bajo `/api/v1`: pedidos, proyectos, planes, tareas, revisión, pausa, reanudación, cancelación, reintento, aprobaciones, memoria, mensajes, artefactos, capacidades, eventos y salud. Separar validación pura de persistencia/despacho. Autenticación Bearer de propietario en instalación inicial; secretos fuera del navegador y logs.

Eventos durables con secuencia, timestamp UTC y correlación. SSE reanudable mediante cursor; snapshot de proyecto para recuperación. Consumidores idempotentes. Las transiciones y sus eventos se escriben en la misma transacción. No publicar eventos anteriores al commit. Auditoría para acciones del propietario.

## 10. Interfaz y operación

Panel propio accesible por teclado: proyectos, planes, estado textual de agentes/tareas, historial, entregables y acciones del propietario. No animar trabajo inexistente. No reutilizar la oficina AGPL como dependencia implícita.

Compose con PostgreSQL y API, versiones fijadas, puerto en loopback por defecto y secretos por entorno. CI: tipos, unitarias y pruebas con PostgreSQL aislado. Backup consistente con pg_dump; restauración en DB separada, sin reanudar efectos ambiguos automáticamente. Producción requiere salud, revisión de cambios y restauración probada. Presupuesto y destinos reales requieren configuración explícita.

## 11. Aceptación

- Plan inválido/cíclico rechazado antes de ejecución.
- Persistencia y deduplicación demostradas con PostgreSQL real.
- Fan-out/fan-in, límites y workspace exclusivo verificados.
- Bucle de modelo y herramientas probado con proveedor determinista local y, por separado, modelo real con presupuesto.
- Revisión controla aceptación y desbloquea descendientes.
- Pausa, cancelación, retry y recuperación no duplican efectos.
- Memoria aislada, traversal rechazado, descargas autenticadas y checksum.
- Aprobación concurrente produce una decisión efectiva.
- Recarga conserva snapshot y cursor de eventos.
- Automatización deduplicada; canales entregan solo al destinatario autorizado.
- Backups/restauración y estabilidad de 24 h probados antes de operación desatendida.

`docs/ACCEPTANCE.md` registra evidencia. Una prueba con transporte/modelo local no acredita inferencia de proveedor real. Funciones ausentes se declaran deshabilitadas en capacidades. El alcance completo continúa vigente aunque una entrega no lo complete.
