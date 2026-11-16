# Decisiones

## 2026-11-16 — iniciar por compatibilidad

Se conserva el SDD adjunto como SDD.md sin modificaciones. La primera entrega contiene inventario de fuentes y un probe de descubrimiento sin dependencias. No se implementa un adaptador de ejecución antes de comprobar el contrato real.

La oficina ya usa el cliente oficial de OpenClaw. Reutilizar esa integración para fase 1; no crear otra interfaz. Mantener código upstream fuera del repositorio y registrar commits candidatos en COMPATIBILITY.md. No fijar imágenes latest ni afirmar compatibilidad por coincidir el número de protocolo.

El probe se implementa en JavaScript nativo para ejecutarse sin instalación. El futuro servicio de coordinación sigue previsto en TypeScript + Fastify.
