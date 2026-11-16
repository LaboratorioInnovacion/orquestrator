# Decisiones

## 2026-11-16 — iniciar por compatibilidad

Se conserva el SDD adjunto como SDD.md sin modificaciones. La primera entrega contiene inventario de fuentes y un probe de descubrimiento sin dependencias. No se implementa un adaptador de ejecución antes de comprobar el contrato real.

La oficina ya usa el cliente oficial de OpenClaw. Reutilizar esa integración para fase 1; no crear otra interfaz. Mantener código upstream fuera del repositorio y registrar commits candidatos en COMPATIBILITY.md. No fijar imágenes latest ni afirmar compatibilidad por coincidir el número de protocolo.

El probe se implementa en JavaScript nativo para ejecutarse sin instalación. El futuro servicio de coordinación sigue previsto en TypeScript + Fastify.

## 2026-11-16 — núcleo del orquestador

La prioridad del producto es la orquestación de agentes: planes, dependencias, asignación, admisión, revisión y recuperación. El adaptador OpenClaw es infraestructura del orquestador, no su finalidad.

Se adelantan contratos y lógica pura de admisión mientras falta la validación real de fase 0. Esto no completa fases 1–3. Se añade /api/v1/plans/validate como utilidad sin efectos ni persistencia; no se presenta como el endpoint de registro de planes. El scheduler recibe un snapshot completo del plan y no debe usarse como scheduler global sin reservas transaccionales y contabilización de otros planes. No aplica aún presupuesto, fairness, leases ni fencing; ninguna ruta despacha tareas.

## 2026-11-16 — cambio explícito de arquitectura y rama

El propietario aclara que quiere un orquestador propio como OpenClaw, no una implementación sobre OpenClaw, y pide todos los cambios en main. SDD 3.0 sustituye la dependencia del Gateway y de My Virtual Office. Se preserva SDD 2.0 como referencia histórica. El probe anterior es histórico y no es requisito del producto. PostgreSQL/pg con migraciones SQL versionadas reemplaza la propuesta Prisma. No hay dos motores ni dos autoridades de ejecución.

## Runtime propio y límites actuales

Los workspaces de herramientas son archivos de texto almacenados en PostgreSQL por intento, no carpetas del host. Esto permite aislar y descargar sin exponer filesystem ni ejecutar shell. La expansión a código/navegador/multimedia requiere herramientas nuevas y límites efectivos.

El coordinador genera proposed-plan.json con propose_plan; el propietario acepta la propuesta antes de registrar y despachar sus tareas. La aceptación, el nuevo plan y sus eventos se escriben juntos. El revisor no puede aprobar por herramienta; actualmente decide el propietario autenticado.

Las decisiones ambiguas no se repiten: lease+ID de intento actúan como fencing para escrituras propias. Las llamadas de modelo están acotadas y se conserva el checkpoint. Reintentos/continuaciones crean intentos nuevos, incorporan revisión, aprobación y mensajes, y tienen límite de tres. Los presupuestos son de tokens por proyecto, no monetarios.

Automatizaciones usan intervalo, saltan solapamientos y procesan como máximo una ocurrencia atrasada por automatización al volver; no reproducen un rango de cron perdido. La zona se registra como contexto, los timestamps permanecen UTC. No se implementa calendario cron.
