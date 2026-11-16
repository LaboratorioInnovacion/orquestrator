# Decisiones

## 2026-11-16 — iniciar por compatibilidad

Se conserva el SDD adjunto como SDD.md sin modificaciones. La primera entrega contiene inventario de fuentes y un probe de descubrimiento sin dependencias. No se implementa un adaptador de ejecución antes de comprobar el contrato real.

La oficina ya usa el cliente oficial de OpenClaw. Reutilizar esa integración para fase 1; no crear otra interfaz. Mantener código upstream fuera del repositorio y registrar commits candidatos en COMPATIBILITY.md. No fijar imágenes latest ni afirmar compatibilidad por coincidir el número de protocolo.

El probe se implementa en JavaScript nativo para ejecutarse sin instalación. El futuro servicio de coordinación sigue previsto en TypeScript + Fastify.

## 2026-11-16 — núcleo del orquestador

La prioridad del producto es la orquestación de agentes: planes, dependencias, asignación, admisión, revisión y recuperación. El adaptador OpenClaw es infraestructura del orquestador, no su finalidad.

Se adelantan contratos y lógica pura de admisión mientras falta la validación real de fase 0. Esto no completa fases 1–3. Se añade /api/v1/plans/validate como utilidad sin efectos ni persistencia; no se presenta como el endpoint de registro de planes. El scheduler recibe un snapshot completo del plan y no debe usarse como scheduler global sin reservas transaccionales y contabilización de otros planes. No aplica aún presupuesto, fairness, leases ni fencing; ninguna ruta despacha tareas.
