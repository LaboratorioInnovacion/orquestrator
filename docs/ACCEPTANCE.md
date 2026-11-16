# Evidencia de aceptación

Fecha: 2026-11-16. Entrega: preparación de fase 0.

| Comprobación | Resultado | Alcance |
| --- | --- | --- |
| SDD.md idéntico al adjunto | Verificado con cmp | Especificación preservada |
| Inspección upstream | Commits registrados en COMPATIBILITY.md | Evidencia estática, no integración |
| npm test | 9/9 pasan en Node 24.22.1 | Challenge válido, JSON inválido, frame incorrecto, nonce ausente, cierre, error, timeout, URL insegura |
| npm run probe:gateway | Falla: no se pudo conectar al Gateway local | No hay Gateway accesible en ws://127.0.0.1:18789 durante esta prueba |
| CI | Workflow añadido | Ejecución remota pendiente |

AT-01 a AT-22: pendientes. No se acreditó ninguna sesión real ni se ejecutó inferencia. Fase 0 sigue abierta hasta probar autenticación, capacidades mínimas y condiciones de activación; fase 1 todavía no iniciada.

## Base del coordinador

- `npm run typecheck`: correcto.
- `npm test`: 34 pruebas pasan (9 probe, 13 contrato, 4 API, 8 admisión).
- DAG: orden topológico, ciclos, referencias faltantes, duplicados, criterios vacíos y límite de 20 tareas.
- Admisión: fan-out, fan-in posterior a aceptación, bloqueo por fallo, concurrencia, workspace exclusivo, pausa y reservas conservadas ante reconciliación/cancelación.
- HTTP: autenticación, estado de salud, capacidades deshabilitadas, 422 por ciclo, 400 por JSON malformado, 413 por tamaño.

Estas pruebas acreditan componentes locales. AT-02/03/04 tienen cobertura parcial de dominio; permanecen pendientes en flujo real. No hay persistencia, reservas globales, despacho ni integración con la oficina en esta entrega.
