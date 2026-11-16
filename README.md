# Orquestrator

Orquestador de un equipo de agentes con **OpenClaw como motor de ejecución** y **My Virtual Office como interfaz**. El coordinador administra objetivos, planes, asignaciones, dependencias, admisión, revisión y recuperación. La conexión al motor es solo una parte del proyecto.

Especificación: [SDD.md](SDD.md).

## Implementado

- API TypeScript + Fastify con token de propietario y límites de tamaño.
- Contrato de planes: validación de roles, entregables, criterios, claves y DAG.
- Núcleo de admisión: límites total/especialistas, exclusión por workspace, pausa, dependencias aceptadas y bloqueo por fallo.
- Conservación de capacidad durante cancelación y reconciliación.
- Pruebas y CI con dependencias fijadas mediante package-lock.json.

El núcleo de admisión es una función de dominio probada. Aún no hay worker, persistencia ni despacho real. Sus decisiones deberán aplicarse transaccionalmente con lease/fencing antes de ejecutar agentes. No se sustituyó OpenClaw por un motor simulado.

## Ejecutar

Node 24.16+ (rama 24) o 26.1+.

```sh
npm ci
npm run typecheck
npm test
export ORCHESTRATOR_TOKEN="$(openssl rand -hex 32)"
npm start
```

Escucha en `127.0.0.1:3000`. `PORT` y `HOST` permiten cambiarlo. No publicar este servicio directamente en Internet.

| Ruta | Comportamiento |
| --- | --- |
| GET /api/v1/health/live | Pública; confirma proceso vivo |
| GET /api/v1/health/ready | Autenticada; 503 mientras falten DB y runtime |
| GET /api/v1/capabilities | Funciones realmente habilitadas |
| POST /api/v1/plans/validate | Valida sin persistir; devuelve 200 o 422 |

Rutas privadas requieren `Authorization: Bearer <ORCHESTRATOR_TOKEN>`. El ejemplo de plan de la sección 9 del SDD puede enviarse al validador. `order` es el orden topológico y `ready` identifica raíces estructurales, no reservas de ejecución.

## Siguiente entrega

Persistencia PostgreSQL/Prisma de objetivos, planes y tareas, con admisión transaccional. Después: despacho nativo OpenClaw con correlación, reconciliación y revisión; visualización desde la oficina. Las pruebas de integración real siguen pendientes y se registran por separado.

[Compatibilidad](docs/COMPATIBILITY.md) · [Aceptación](docs/ACCEPTANCE.md) · [Decisiones](docs/DECISIONS.md) · [Operación](docs/RUNBOOK.md)
