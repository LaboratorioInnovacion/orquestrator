# Operación local — fase 0

1. Comprobar `node --version` y ejecutar `npm test`.
2. Con un Gateway aislado ya configurado, ejecutar `OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789 npm run probe:gateway`.
3. Si falla, revisar disponibilidad, dirección y acceso de red. El probe no reintenta ni modifica configuración.
4. Un challenge válido solo confirma descubrimiento. Continuar con cliente oficial y pairing soportado para probar autenticación y sesión.

No pasar secretos en la URL ni guardar credenciales en Git. No hay migraciones, servicios persistentes, despliegue, backups ni inferencia incluidos en esta entrega.
