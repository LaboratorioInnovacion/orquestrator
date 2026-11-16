# Operación

## Arranque

Seguir README y .env.example. Usar credenciales separadas, proveedor de modelo con tools y presupuesto explícito. Compose aplica migraciones al iniciar; falla si cambia el checksum de una migración aplicada. No editar migraciones aplicadas; añadir una versión nueva.

Solo se publica loopback. Para acceso remoto usar túnel o el proxy privado existente con TLS. No exponer PostgreSQL. Las imágenes no utilizan latest; la API corre como usuario node, sin capabilities, filesystem de contenedor de solo lectura y tmpfs temporal.

`health/live` confirma el proceso. `health/ready` autenticado exige DB accesible y configuración de modelo; **no certifica que credenciales o cuota del proveedor funcionen**. Sin modelo, el panel/gestión persisten y el worker permanece apagado.

## Fallos y reconciliación

Pausar proyecto impide claims nuevos. Cancelar una tarea propaga descendientes y aborta peticiones en proceso al siguiente tick. Abort/timeout no garantiza ausencia de consumo o efectos ya completados.

Leases de 3 minutos se renuevan en checkpoints. Ante expiración, la tarea queda needs_reconciliation y conserva su reserva. Comprobar historial, archivos y estado del proveedor. Solo entonces enviar retry con evidencia y versión vigente. Lo desconocido se carga conservadoramente a tokens antes de reservar otro intento. No hay reintento ciego ni fallback que duplique efectos.

Entregas requieren revisión; waiting_approval/reviewing/needs_reconciliation retienen capacidad de admisión por diseño conservador. Expiración de aprobación bloquea tarea. Las correcciones y continuaciones tienen límite de tres intentos. Detener el proceso envía abort y deja lo ambiguo para reconciliación.

## Backups

```sh
mkdir -p work/backups
sh scripts/operations/backup.sh work/backups/orquestrator.dump
sh scripts/operations/restore.sh work/backups/orquestrator.dump restore_verificacion
```

pg_dump en formato custom conserva tablas, sesiones, eventos y artefactos. Los scripts no imprimen credenciales y crean archivos privados. El propietario debe cifrar y copiar diariamente fuera del host. No hay destino remoto/cifrado automático configurado.

Restore crea una base nueva con prefijo restore_; no sobrescribe producción. Verificar cantidades, relaciones, historial y checksums. No iniciar workers contra la copia sin pausar proyectos/automatizaciones y reconciliar ejecuciones. Una restauración no debe reproducir acciones antiguas.

## Construcción en Cloud

Dockerfile normal usa npm ci con TLS. En este entorno el proxy requiere CA de sesión: la prueba se hizo con copia temporal del Dockerfile y BuildKit secret `proxy_ca`, montado solo durante npm ci mediante NODE_EXTRA_CA_CERTS. No incluir certificados ni credenciales de sesión en el repositorio o imagen. Conservar verificación TLS.

## Limitaciones operativas

Sin HA, retención automática, observabilidad Prometheus, alertas externas ni prueba de estabilidad 24 h. Eventos y artefactos crecen hasta que se defina política de retención. No activar operación desatendida como si esas pruebas estuvieran completas. Consultar FEATURES.md.
