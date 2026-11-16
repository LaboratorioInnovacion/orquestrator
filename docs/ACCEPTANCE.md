# Evidencia — SDD 3.0

Fecha: 2026-11-16. Rama solicitada: main. Arquitectura: runtime nativo, sin OpenClaw ni My Virtual Office. Los resultados anteriores del probe upstream quedan históricos.

| Comprobación | Evidencia |
| --- | --- |
| Tipos | npm run typecheck correcto |
| Unitarias/contratos HTTP de modelo | 30 pruebas; esquema/DAG, admisión, autenticación, tamaños, respuestas y errores de proveedor |
| PostgreSQL real | Suite con esquemas aislados por ejecución; pedidos idempotentes, conflictos, persistencia y reapertura de Store |
| Concurrencia | Claims simultáneos con límite de especialistas y revisión previa al fan-in |
| Planificación nativa | Objetivo crea coordinator; modelo determinista entrega DAG; aceptación registra revisión nueva |
| Herramientas | Ciclo de modelo/herramientas con checkpoints y artefactos descargables |
| Archivos y memoria | Traversal rechazado; lectura limitada a proyecto/intento/dependencias; memoria de otro proyecto no aparece |
| Revisión y aprobaciones | Dos decisiones concurrentes producen éxito+409; hash incorrecto rechazado |
| Fallos | Lease vencido queda needs_reconciliation; no redispatch automático; retry carga estimación conservadora |
| Pausa/cancelación/presupuesto | No se reclama un proyecto pausado ni con presupuesto insuficiente; cancelación propaga descendientes |
| Automatización | Una ocurrencia por intervalo; rechazo de solapamiento con trabajo sin terminar |
| Webhook | HMAC, timestamp vigente, replay idempotente y timestamp viejo rechazado |
| SSE | Entrega de evento comprometido y cierre tras abortar cliente; prueba HTTP real |
| Intervención humana | waiting_input conserva pregunta; respuesta del propietario entra al contexto del nuevo intento |
| Panel real | Chromium: login, crear objetivo, texto malicioso no interpretado como HTML, ancho móvil 390px y logout |
| Backup/restauración | pg_dump custom y pg_restore a base nueva: 66 tareas restauradas; no se arrancó worker contra la copia |
| Contenedor | Imagen construida con npm ci y CA de sesión montada como secret; arranque verificado sin privilegios y read-only, con DB/API/panel operativos |

La suite de integración ejecuta 14 pruebas contando la prueba contenedora y el panel. Usa proveedor determinista para probar el motor; no acredita calidad ni disponibilidad de modelos reales. No se usaron credenciales de inferencia ni se consumió presupuesto de un proveedor.

Pendientes: inferencia real con modelo/credenciales, SSE bajo carga y proxy, continuidad de 24 h, métricas operativas y capacidades avanzadas de FEATURES.md. No se declara implementado el alcance completo.
