# Orquestrator

**Motor propio de agentes de IA**, similar en propósito a OpenClaw. Planifica objetivos, ejecuta especialistas, coordina dependencias y conserva resultados. No depende de OpenClaw ni de My Virtual Office.

Diseño vigente: [SDD 3.0](SDD.md). El SDD anterior se conserva como referencia histórica. Desarrollo en `main` por decisión del propietario.

## Qué funciona

- Coordinador que propone un DAG a partir del objetivo y lo entrega para aceptación.
- Runtime nativo con sesiones/checkpoints, bucle modelo/herramientas y perfiles de agente.
- PostgreSQL: planes versionados, tareas, intentos, archivos, memoria, mensajes, eventos y auditoría.
- Admisión transaccional: tres intentos activos, dos especialistas, dependencias aceptadas y pausa.
- Archivos de texto aislados en base de datos, checksum y descarga autenticada por ID.
- Revisión por propietario, correcciones limitadas y cancelación de descendientes.
- Preguntas al propietario y aprobaciones vinculadas a acción, hash, versión y vencimiento.
- Presupuesto de tokens con reservas y estimaciones conservadoras cuando falta uso real.
- Automatizaciones por intervalo, sin solapamiento ni recuperación masiva de ocurrencias vencidas.
- Webhook firmado, deduplicación, eventos con cursor y SSE.
- Panel web propio, API autenticada, CI, contenedor y procedimientos de backup/restauración.

No están implementados shell, navegador de agentes, canales de mensajería, multimedia, ACP, nodos remotos, plugins dinámicos, RAG vectorial, cron con calendario, fallback de modelos ni presupuesto monetario. No se han probado inferencias con un proveedor real ni estabilidad de 24 h. Consultar [estado completo](docs/FEATURES.md).

## Arranque con Docker

```sh
cp .env.example .env
```

Completar `ORCHESTRATOR_TOKEN` y `POSTGRES_PASSWORD` con valores distintos generados con `openssl rand -hex 32`. Configurar `MODEL_BASE_URL`, `MODEL_NAME` y, si corresponde, `MODEL_API_KEY` de un proveedor compatible con Chat Completions y herramientas. La URL base suele terminar en `/v1`. Usar HTTPS fuera de loopback.

```sh
docker compose up --build -d
```

Abrir **http://localhost:3000** e ingresar el token del propietario. Sin proveedor configurado se puede gestionar proyectos/planes pero no se ejecutan agentes; readiness devuelve 503. Las credenciales no se envían al panel.

Crear un objetivo y presupuesto; comienza pausado con una tarea de coordinador. Reanudar para generar la propuesta. Revisar sus entregables y aceptar el plan; se registran las tareas para ejecución. Cada entrega espera revisión antes de desbloquear dependencias. El presupuesto se comparte entre planificación, ejecución y correcciones. Las aprobaciones registran decisiones; no agregan herramientas externas que el sistema no tenga.

## Desarrollo local

Node 24.16+ de la rama 24 o >=26.1; PostgreSQL 17.

```sh
npm ci
npm run check
npm run test:integration
```

La integración requiere `TEST_DATABASE_URL` apuntando a una base aislada; sin ella se omite. La prueba de panel requiere además `CHROMIUM_PATH` a un Chromium instalado. Nunca usar una base de producción para pruebas.

Para iniciar localmente, exportar `DATABASE_URL`, `ORCHESTRATOR_TOKEN` y las variables del modelo, y ejecutar `npm start`. Las migraciones versionadas se aplican antes de escuchar. `npm run db:migrate` permite aplicarlas por separado. Escucha en `127.0.0.1:3000` por defecto; `HOST` y `PORT` son configurables.

[API](docs/API.md) · [Funciones](docs/FEATURES.md) · [Aceptación](docs/ACCEPTANCE.md) · [Operación](docs/RUNBOOK.md) · [Decisiones](docs/DECISIONS.md)
