# Operación local — fase 0

1. Comprobar `node --version` y ejecutar `npm test`.
2. Con un Gateway aislado ya configurado, ejecutar `OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789 npm run probe:gateway`.
3. Si falla, revisar disponibilidad, dirección y acceso de red. El probe no reintenta ni modifica configuración.
4. Un challenge válido solo confirma descubrimiento. Continuar con cliente oficial y pairing soportado para probar autenticación y sesión.

No pasar secretos en la URL ni guardar credenciales en Git. No hay migraciones, servicios persistentes, despliegue, backups ni inferencia incluidos en esta entrega.

## API del coordinador

Ejecutar `npm ci`, generar un ORCHESTRATOR_TOKEN de al menos 32 caracteres y ejecutar `npm start`. Por defecto escucha en loopback, puerto 3000. Token ausente o puerto inválido impiden el arranque. El logger filtra Authorization. SIGTERM/SIGINT cierran Fastify.

GET /api/v1/health/live no requiere token. Las demás rutas sí. Readiness devuelve 503 deliberadamente: no puede admitir trabajo durable todavía. No usar esta entrega para ejecución desatendida.
