import { validatePlan } from '../../packages/contracts/plan.ts';
import { z } from 'zod';
import { Store, id, hash, Conflict } from '../../packages/database/store.ts';
import type { ToolSpec } from './model.ts';
export type RunContext = {projectId:string;taskId:string;attemptId:string};
const filename=z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/).refine(x=>x!=='.'&&x!=='..');
export const toolSchemas = {
  request_input:z.object({question:z.string().min(1).max(2000)}).strict(),
  propose_plan:z.object({plan:z.unknown()}).strict(),
  write_file:z.object({name:filename,content:z.string().max(100_000)}).strict(),
  read_file:z.object({name:filename}).strict(),
  remember:z.object({key:z.string().min(1).max(100),content:z.string().min(1).max(8000),source:z.string().min(1).max(500)}).strict(),
  recall:z.object({query:z.string().max(200)}).strict(),
  send_message:z.object({recipient:z.enum(['coordinator','researcher','executor','reviewer','owner']),type:z.enum(['question','handoff','delivery','block']),content:z.string().min(1).max(8000)}).strict(),
  request_approval:z.object({action:z.string().min(1).max(200),parameters:z.record(z.string(),z.unknown())}).strict()
};
const descriptions: Record<keyof typeof toolSchemas,string> = {
  request_input:'Pedir información imprescindible al propietario; conserva el trabajo y espera respuesta.',
  propose_plan:'Solo coordinador: entregar un plan de tareas para aceptación del propietario. Incluye objective, revision y hasta 20 tasks con key,role,dependsOn,deliverable,criteria.',
  write_file:'Publicar un archivo de texto en el espacio aislado de este intento.',
  read_file:'Leer un archivo de este intento o un entregable de dependencia aceptada.',
  remember:'Guardar memoria de proyecto con fuente. No guardar secretos.',
  recall:'Buscar memoria del proyecto actual; no otorga permisos nuevos.',
  send_message:'Registrar una pregunta, entrega o handoff dirigido. No cambia asignaciones.',
  request_approval:'Solicitar decisión del propietario sobre una acción concreta. No ejecuta la acción.'
};
export const toolSpecs: ToolSpec[] = Object.entries(toolSchemas).map(([name,schema])=>({
  type:'function',function:{name,description:descriptions[name as keyof typeof toolSchemas],parameters:z.toJSONSchema(schema) as Record<string,unknown>}
}));
export async function artifact(store:Store,ctx:RunContext,name:string,content:string) {
  filename.parse(name);
  if(Buffer.byteLength(content)>100_000) throw new Error('Artefacto demasiado grande.');
  return store.tx(async c=>{
    await c.query('SELECT pg_advisory_xact_lock(884023)');
    const run=(await c.query('SELECT a.status,t.status AS task_status FROM attempts a JOIN tasks t ON t.id=a.task_id WHERE a.id=$1 AND a.task_id=$2 FOR UPDATE OF a,t',[ctx.attemptId,ctx.taskId])).rows[0];
    if(!run || run.status!=='running' || run.task_status!=='running') throw new Conflict('Intento sin autoridad vigente.');
    const artifactId=id();
    const row=(await c.query(`INSERT INTO artifacts(id,project_id,task_id,attempt_id,name,mime,content,checksum,size)
      VALUES($1,$2,$3,$4,$5,'text/plain; charset=utf-8',$6,$7,$8)
      ON CONFLICT(attempt_id,name) DO UPDATE SET content=EXCLUDED.content,checksum=EXCLUDED.checksum,size=EXCLUDED.size RETURNING id`,
      [artifactId,ctx.projectId,ctx.taskId,ctx.attemptId,name,content,hash(content),Buffer.byteLength(content)])).rows[0];
    await store.event(c,'artifact.created',ctx.projectId,ctx.taskId,{artifactId:row.id,attemptId:ctx.attemptId,name});
    return {artifactId:row.id,name,checksum:hash(content)};
  });
}
export async function executeTool(store:Store,ctx:RunContext,name:string,args:unknown) {
  if(!Object.hasOwn(toolSchemas,name)) throw new Error('Herramienta no permitida.');
  const schema=toolSchemas[name as keyof typeof toolSchemas];
  const input=schema.parse(args) as Record<string,any>;
  if(name==='propose_plan') {
    const task=(await store.pool.query('SELECT role FROM tasks WHERE id=$1',[ctx.taskId])).rows[0];
    if(task?.role!=='coordinator') throw new Error('Solo el coordinador puede proponer planes.');
    const parsed=validatePlan(input.plan);
    if(!parsed.valid) return parsed;
    return artifact(store,ctx,'proposed-plan.json',JSON.stringify(parsed.plan,null,2));
  }
  if(name==='write_file') return artifact(store,ctx,input.name,input.content);
  return store.tx(async c=>{
    await c.query('SELECT pg_advisory_xact_lock(884023)');
    const run=(await c.query('SELECT a.status,t.status AS task_status FROM attempts a JOIN tasks t ON t.id=a.task_id WHERE a.id=$1 AND a.task_id=$2 FOR UPDATE OF a,t',[ctx.attemptId,ctx.taskId])).rows[0];
    if(!run || run.status!=='running' || run.task_status!=='running') throw new Conflict('Intento sin autoridad vigente.');
    if(name==='read_file') {
      const rows=(await c.query(`SELECT ar.name,ar.content,ar.checksum FROM artifacts ar JOIN tasks t ON t.id=ar.task_id
        WHERE ar.project_id=$1 AND ar.name=$2 AND (ar.attempt_id=$3 OR ar.task_id=$4 OR
        (t.status='completed' AND ar.attempt_id=(SELECT id FROM attempts WHERE task_id=t.id ORDER BY number DESC LIMIT 1) AND t.plan_id=(SELECT plan_id FROM tasks WHERE id=$4)
        AND t.key IN (SELECT jsonb_array_elements_text(depends_on) FROM tasks WHERE id=$4))) LIMIT 5`,
        [ctx.projectId,input.name,ctx.attemptId,ctx.taskId])).rows;
      return {files:rows};
    }
    if(name==='remember') {
      await c.query('SELECT pg_advisory_xact_lock(884024)');
      const revision=Number((await c.query('SELECT COALESCE(MAX(revision),0)+1 AS n FROM memories WHERE project_id=$1 AND key=$2',[ctx.projectId,input.key])).rows[0].n);
      await c.query('INSERT INTO memories(id,project_id,key,content,source,author,revision) VALUES($1,$2,$3,$4,$5,$6,$7)',[id(),ctx.projectId,input.key,input.content,input.source,ctx.attemptId,revision]);
      await store.event(c,'memory.created',ctx.projectId,ctx.taskId,{key:input.key,revision});
      return {key:input.key,revision};
    }
    if(name==='recall') return {entries:(await c.query(`SELECT * FROM (SELECT DISTINCT ON(key) key,content,source,revision,expires_at FROM memories
      WHERE project_id=$1 ORDER BY key,revision DESC) current_memories
      WHERE (expires_at IS NULL OR expires_at>now()) AND (strpos(lower(content),lower($2))>0 OR strpos(lower(key),lower($2))>0) LIMIT 10`,[ctx.projectId,input.query])).rows};
    if(name==='send_message') {
      const messageId=id();
      await c.query('INSERT INTO messages(id,project_id,task_id,sender,recipient,type,content,correlation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [messageId,ctx.projectId,ctx.taskId,ctx.attemptId,input.recipient,input.type,input.content,ctx.attemptId]);
      await store.event(c,'agent.message',ctx.projectId,ctx.taskId,{messageId,recipient:input.recipient});
      return {messageId};
    }
    if(name==='request_input') {
      const messageId=id();
      await c.query('INSERT INTO messages(id,project_id,task_id,sender,recipient,type,content,correlation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[messageId,ctx.projectId,ctx.taskId,ctx.attemptId,'owner','question',input.question,ctx.attemptId]);
      await c.query("UPDATE tasks SET status='waiting_input',version=version+1 WHERE id=$1",[ctx.taskId]);
      await c.query("UPDATE attempts SET status='waiting_input' WHERE id=$1",[ctx.attemptId]);
      await store.event(c,'task.waiting_input',ctx.projectId,ctx.taskId,{messageId,question:input.question});
      return {status:'waiting_input',messageId};
    }
    if(name==='request_approval') {
      const approvalId=id(); const actionHash=hash(JSON.stringify(input));
      await c.query("INSERT INTO approvals(id,task_id,attempt_id,action,action_hash,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '1 hour')",[approvalId,ctx.taskId,ctx.attemptId,JSON.stringify(input),actionHash]);
      await c.query("UPDATE tasks SET status='waiting_approval',version=version+1 WHERE id=$1",[ctx.taskId]);
      await c.query("UPDATE attempts SET status='waiting_approval' WHERE id=$1",[ctx.attemptId]);
      await store.event(c,'approval.requested',ctx.projectId,ctx.taskId,{approvalId,actionHash});
      return {approvalId,actionHash,status:'pending',notice:'No se ha ejecutado la acción. La resolución se incorpora al contexto del siguiente intento.'};
    }
    throw new Error('Herramienta no implementada.');
  });
}
