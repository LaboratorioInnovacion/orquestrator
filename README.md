# Orquestrator

Equipo personal de IA con **OpenClaw** como motor y **My Virtual Office** como interfaz. Servicio de coordinación previsto: TypeScript + Fastify y PostgreSQL + Prisma. No se reemplazan los productos upstream con simulaciones.

La especificación original está en [SDD.md](SDD.md). Estado actual: preparación de fase 0; no hay un agente real conectado todavía.

## Desarrollo

Requiere Node 24.16+ (rama 24) o 26.1+. Esta entrega no tiene dependencias externas.

```sh
npm test
npm run probe:gateway
```

El probe usa `OPENCLAW_GATEWAY_URL` o `ws://127.0.0.1:18789`. Solo verifica el challenge de descubrimiento; no autentica ni ejecuta agentes. Sin un Gateway activo termina con error, como corresponde.

## Documentación

- [Compatibilidad e integración pendiente](docs/COMPATIBILITY.md)
- [Evidencia de aceptación](docs/ACCEPTANCE.md)
- [Decisiones](docs/DECISIONS.md)
- [Operación local](docs/RUNBOOK.md)

Siguiente entrega: completar validación real de versiones y conectar un agente en la oficina (AT-01). Se necesitan Gateway y oficina aislados, proveedor/modelo y presupuesto definido. No desplegar producción desde esta rama.
