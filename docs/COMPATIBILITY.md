# Requisitos y contratos — arquitectura nativa

SDD 3.0 sustituye la integración upstream. OpenClaw y My Virtual Office no son dependencias. El inventario anterior se puede consultar en el historial Git anterior a esta entrega.

| Componente | Versión/contrato | Verificación |
| --- | --- | --- |
| Node | 24.22.1 local; imagen 24.16.0 | Tipos, pruebas, arranque |
| PostgreSQL | 17.6-alpine | Persistencia, transacciones, concurrencia, recuperación y restauración aislada |
| Fastify/Zod/pg | Versiones exactas resueltas en package-lock.json | npm ci y pruebas |
| Proveedor de modelos | POST {MODEL_BASE_URL}/chat/completions; messages, tools, max_tokens; choices y usage | Servidor HTTP local de contrato; inferencia real pendiente |
| Panel | HTML/CSS/JS propios; Chromium local | Autenticación, creación de objetivo, XSS por texto y viewport 390px |
| Automatización | Intervalos >=60 s; timestamps UTC y timezone válida | Prueba PostgreSQL, sin solapamiento |

No se adquirieron servicios/licencias ni se consumieron modelos de pago. Los paquetes usados tienen sus licencias publicadas; no se incorporó código de los repositorios OpenClaw/oficina. La imagen de Node y PostgreSQL están fijadas por versión; para una promoción a producción registrar digest y SHA de esta aplicación.
