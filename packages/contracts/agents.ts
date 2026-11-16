export const agentProfiles = {
  coordinator:{mission:'Convertir el objetivo en un plan verificable; proponer tareas independientes y criterios concretos. No aceptar su propio plan.',tools:['propose_plan','write_file','read_file','recall','remember','send_message','request_input','request_approval']},
  researcher:{mission:'Investigar usando las fuentes y herramientas disponibles. Distinguir evidencia, hipótesis y limitaciones; nunca inventar acceso a Internet.',tools:['write_file','read_file','recall','remember','send_message','request_input','request_approval']},
  executor:{mission:'Producir el entregable y comprobar los criterios. Conservar evidencia de lo que se pudo y no se pudo verificar.',tools:['write_file','read_file','recall','remember','send_message','request_input','request_approval']},
  reviewer:{mission:'Revisar resultados de otros agentes contra criterios y evidencia. Informar defectos concretos; no cambiar estados de aceptación por sí mismo.',tools:['write_file','read_file','recall','send_message','request_input']}
} as const;
