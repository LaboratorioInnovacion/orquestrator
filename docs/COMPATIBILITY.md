# Compatibilidad — fase 0

Inspección de fuentes: 2026-11-16. Los commits siguientes son candidatos reproducibles, **no una combinación compatible certificada**.

| Componente | Versión declarada | Commit / referencia | Protocolo y autenticación | Evidencia | Estado |
| --- | --- | --- | --- | --- | --- |
| OpenClaw | 2026.11.4 | b58996d69286d55d1bbbd9b5c03b4ad837baac45 | WebSocket v4; identidad de dispositivo, pairing y credenciales según configuración | package.json; docs/gateway/protocol/versioning.md y auth.md | Código inspeccionado; sin sesión real |
| My Virtual Office | 0.12.0 | 6721f84375350c06b281c63fe0e13638ac71f274 | Provider Contract 1.1; cliente oficial con handshake firmado | README.md; docs/PROVIDER-SDK.md; app/provider-layer/server/providers/openclaw/link.js | Código inspeccionado; sin activación/conexión probada |
| Cliente Gateway de la oficina | 2026.10.4 | app/provider-layer/package-lock.json del commit anterior | @openclaw/gateway-client; protocolo v4 según manifest | package.json y server/providers/manifest.js | Cruce con Gateway 2026.11.4 pendiente |
| Node local | 24.22.1 | node --version | OpenClaw requiere >=24.16 <25 o >=26.1; oficina >=22.19 | Ejecutado localmente | Requisito de versión satisfecho |
| Docker local | 29.9.2 | docker --version | No se inspeccionó daemon | Ejecutado localmente | CLI disponible; despliegue pendiente |

## Licencia y activación

My Virtual Office incluye LICENSE AGPL-3.0; su provider-layer declara AGPL-3.0-or-later. El README documenta demo con hasta tres personajes visibles, chat y voz. Agent Studio, edición de oficina, cron, SMS y Agent Browser requieren licencia. No se ha introducido ni adquirido una clave. Verificar condiciones antes de distribuir un fork. Mantener upstream separado.

## Pruebas reproducibles

- `npm test`: comportamiento del probe frente a challenge válido, datos inválidos, cierre y timeout. Usa un transporte de prueba; **no acredita compatibilidad upstream**.
- `npm run probe:gateway`: comprueba únicamente recepción de `connect.challenge` en un Gateway real. No autentica, crea sesiones, invoca modelos ni gasta tokens. Falla si no existe Gateway.
- Configurar `OPENCLAW_GATEWAY_URL` con ws:// o wss:// sin credenciales en URL. Por defecto: ws://127.0.0.1:18789.

## Condición para fase 1

Instalar candidatos en entorno aislado y comprobar handshake autenticado, pairing de oficina, descubrimiento de agente, envío/recepción, correlación, recarga y cancelación. Registrar versiones y evidencia sin tokens. Elegir proveedor/modelo y presupuesto de prueba antes de inferencia. No habilitar despacho ni publicar imágenes de producción hasta demostrar capacidades. No hay servicios ni credenciales de modelo configurados por este cambio.

Fuentes: https://github.com/openclaw/openclaw y https://github.com/eliautobot/my-virtual-office en los commits registrados.
