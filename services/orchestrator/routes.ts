import { agentProfiles } from '../../packages/contracts/agents.ts';
import { registerAutomations } from './automations.ts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Store,Conflict,Missing,id } from '../../packages/database/store.ts';
import { validatePlan } from '../../packages/contracts/plan.ts';

const text=z.string().trim().min(1).max(8000);
const uuid=z.string().uuid();
const params=z.object({id:uuid});
const version=z.number().int().positive();
const requestSchema=z.object({source:z.string().min(1).max(100).default('web'),externalId:z.string().min(1).max(200),name:text,objective:text,tokenLimit:z.number().int().min(1000).max(100_000_000),planAutomatically:z.boolean().default(true)}).strict();
const cleanArtifact=(row:any)=>{const {content,...metadata}=row;return metadata;};

export function registerRoutes(app:FastifyInstance,store:Store) {
  let closing=false;
  app.addHook('preClose',async()=>{closing=true;});
  registerAutomations(app,store);
  app.setErrorHandler((error,request,reply)=>{
    if(error instanceof z.ZodError) return reply.code(422).send({error:'invalid_input',issues:error.issues.map(i=>({path:i.path.join('.'),message:i.message}))});
    if(error instanceof Conflict || (error as any).code==='23505') return reply.code(409).send({error:'conflict',message:error instanceof Conflict?error.message:'Registro duplicado.'});
    if(error instanceof Missing) return reply.code(404).send({error:'not_found',message:error.message});
    const status=(error as any).statusCode;
    if(status && status<500) return reply.code(status).send({error:'invalid_request'});
    request.log.error({requestId:request.id},'Dependencia o error interno; no se incluyen datos sensibles.');
    return reply.code(503).send({error:'service_unavailable'});
  });
  app.post('/api/v1/requests',async(request,reply)=>{
    const input=requestSchema.parse(request.body);
    const result=await store.request(input);
    return reply.code(result.duplicate?200:201).send(result);
  });
  app.get('/api/v1/agents',async()=>({agents:Object.entries(agentProfiles).map(([role,profile])=>({role,...profile}))}));
  app.get('/api/v1/projects/:id/sessions',async request=>({sessions:(await store.pool.query('SELECT a.id,a.task_id,a.number,a.status,a.model,a.usage,a.usage_estimated,a.created_at,a.finished_at FROM attempts a JOIN tasks t ON t.id=a.task_id WHERE t.project_id=$1 ORDER BY a.created_at DESC LIMIT 100',[params.parse(request.params).id])).rows}));
  app.get('/api/v1/sessions/:id',async request=>{
    const session=(await store.pool.query('SELECT * FROM attempts WHERE id=$1',[params.parse(request.params).id])).rows[0];
    if(!session) throw new Missing('Sesión inexistente.');
    return {session};
  });
  app.post('/api/v1/tasks/:id/input',async request=>{
    const taskId=params.parse(request.params).id;
    const body=z.object({version,content:text}).strict().parse(request.body);
    return store.tx(async c=>{
      await c.query('SELECT pg_advisory_xact_lock(884023)');
      const task=(await c.query('SELECT * FROM tasks WHERE id=$1 FOR UPDATE',[taskId])).rows[0];
      if(!task) throw new Missing('Tarea inexistente.');
      if(task.version!==body.version||task.status!=='waiting_input') throw new Conflict('La tarea ya no espera esta entrada.');
      const run=(await c.query('SELECT * FROM attempts WHERE task_id=$1 ORDER BY number DESC LIMIT 1',[taskId])).rows[0];
      if(!run||run.usage===null) throw new Conflict('El intento aún cierra su checkpoint.');
      if(run.number>=3) throw new Conflict('Límite de intentos alcanzado.');
      await c.query('INSERT INTO messages(id,project_id,task_id,sender,recipient,type,content,correlation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id(),task.project_id,taskId,'owner',task.role,'answer',body.content,run.id]);
      await c.query("UPDATE tasks SET status='ready',version=version+1 WHERE id=$1",[taskId]);
      await store.event(c,'task.ready',task.project_id,taskId,{reason:'input_received'});
      await store.audit(c,'task.input',task.project_id,{taskId});
      return {status:'ready'};
    });
  });
  app.get('/api/v1/projects',async()=>({projects:(await store.pool.query('SELECT * FROM projects ORDER BY created_at DESC LIMIT 100')).rows}));
  app.get('/api/v1/projects/:id',async request=>store.snapshot(params.parse(request.params).id));
  app.post('/api/v1/projects/:id/plans',async(request,reply)=>{
    const result=validatePlan(request.body);
    if(!result.valid) return reply.code(422).send(result);
    return reply.code(201).send(await store.savePlan(params.parse(request.params).id,result.plan));
  });
  for(const action of ['pause','resume'] as const) app.post(`/api/v1/projects/:id/${action}`,async request=>{
    const projectId=params.parse(request.params).id;
    return store.tx(async c=>{
      const result=await c.query('UPDATE projects SET paused=$2 WHERE id=$1 RETURNING id,paused',[projectId,action==='pause']);
      if(!result.rowCount) throw new Missing('Proyecto inexistente.');
      await store.event(c,`project.${action}`,projectId,null);
      await store.audit(c,`project.${action}`,projectId);
      return result.rows[0];
    });
  });
  app.post('/api/v1/projects/:id/budget',async request=>{
    const projectId=params.parse(request.params).id;
    const body=z.object({expectedTokenLimit:z.number().int().positive(),tokenLimit:z.number().int().min(1000).max(100_000_000)}).strict().parse(request.body);
    return store.tx(async c=>{
      const project=(await c.query('SELECT * FROM projects WHERE id=$1 FOR UPDATE',[projectId])).rows[0];
      if(!project) throw new Missing('Proyecto inexistente.');
      if(Number(project.token_limit)!==body.expectedTokenLimit) throw new Conflict('El presupuesto cambió.');
      if(body.tokenLimit<Number(project.consumed)+Number(project.reserved)) throw new Conflict('El límite no puede ser menor al consumo y las reservas.');
      await c.query('UPDATE projects SET token_limit=$2 WHERE id=$1',[projectId,body.tokenLimit]);
      await store.event(c,'budget.updated',projectId,null,{tokenLimit:body.tokenLimit});
      await store.audit(c,'budget.update',projectId,{before:body.expectedTokenLimit,after:body.tokenLimit});
      return {tokenLimit:body.tokenLimit};
    });
  });
  app.get('/api/v1/tasks/:id',async request=>{
    const taskId=params.parse(request.params).id;
    const task=(await store.pool.query('SELECT * FROM tasks WHERE id=$1',[taskId])).rows[0];
    if(!task) throw new Missing('Tarea inexistente.');
    const attempts=(await store.pool.query('SELECT * FROM attempts WHERE task_id=$1 ORDER BY number',[taskId])).rows;
    const artifacts=(await store.pool.query('SELECT * FROM artifacts WHERE task_id=$1 ORDER BY created_at',[taskId])).rows.map(cleanArtifact);
    const approvals=(await store.pool.query('SELECT * FROM approvals WHERE task_id=$1 ORDER BY created_at',[taskId])).rows;
    const messages=(await store.pool.query('SELECT * FROM messages WHERE task_id=$1 ORDER BY created_at',[taskId])).rows;
    return {task,attempts,artifacts,approvals,messages};
  });
  app.post('/api/v1/tasks/:id/review',async request=>{
    const taskId=params.parse(request.params).id;
    const body=z.object({version,decision:z.enum(['accept','reject']),evidence:text,defects:z.array(text).max(20).default([])}).strict().parse(request.body);
    return store.tx(async c=>{
      await c.query('SELECT pg_advisory_xact_lock(884023)');
      const task=(await c.query('SELECT * FROM tasks WHERE id=$1 FOR UPDATE',[taskId])).rows[0];
      if(!task) throw new Missing('Tarea inexistente.');
      if(task.status!=='reviewing' || task.version!==body.version) throw new Conflict('Estado o versión de tarea cambió.');
      if(body.decision==='reject' && !body.defects.length) throw new Conflict('El rechazo requiere defectos concretos.');
      const n=Number((await c.query('SELECT COUNT(*) AS n FROM attempts WHERE task_id=$1',[taskId])).rows[0].n);
      const status=body.decision==='accept'?'completed':n>=3?'failed':'ready';
      await c.query('UPDATE tasks SET status=$2,review=$3,version=version+1 WHERE id=$1',[taskId,status,JSON.stringify({...body,reviewer:'owner',at:new Date().toISOString()})]);
      if(status==='completed' && task.role==='coordinator' && task.key==='plan-objective') {
        await c.query('SELECT id FROM projects WHERE id=$1 FOR UPDATE',[task.project_id]);
        const proposal=(await c.query("SELECT content FROM artifacts WHERE task_id=$1 AND name='proposed-plan.json' ORDER BY created_at DESC LIMIT 1",[taskId])).rows[0];
        if(!proposal) throw new Conflict('El coordinador debe entregar proposed-plan.json antes de aceptar el plan.');
        const parsed=validatePlan(JSON.parse(proposal.content));
        if(!parsed.valid) throw new Conflict('La propuesta no es un plan válido.');
        const revision=Number((await c.query('SELECT COALESCE(MAX(revision),0)+1 AS n FROM plans WHERE project_id=$1',[task.project_id])).rows[0].n);
        await store.insertPlan(c,task.project_id,{...parsed.plan,revision});
      }
      await store.event(c,'review.completed',task.project_id,taskId,{decision:body.decision,evidence:body.evidence,defects:body.defects});
      if(status==='completed') await store.event(c,'task.completed',task.project_id,taskId);
      await store.audit(c,'task.review',task.project_id,{taskId,decision:body.decision});
      return {status};
    });
  });
  app.post('/api/v1/tasks/:id/cancel',async request=>{
    const taskId=params.parse(request.params).id;
    const body=z.object({version}).strict().parse(request.body);
    return store.tx(async c=>{
      await c.query('SELECT pg_advisory_xact_lock(884023)');
      const task=(await c.query('SELECT * FROM tasks WHERE id=$1 FOR UPDATE',[taskId])).rows[0];
      if(!task) throw new Missing('Tarea inexistente.');
      if(task.version!==body.version || ['completed','cancelled'].includes(task.status)) throw new Conflict('Estado o versión cambió.');
      const tasks=(await c.query('SELECT * FROM tasks WHERE plan_id=$1 FOR UPDATE',[task.plan_id])).rows;
      const cancel=new Set([task.key]);
      for(let i=0;i<tasks.length;i++) for(const t of tasks) if(t.depends_on.some((key:string)=>cancel.has(key))) cancel.add(t.key);
      const cancelled:string[]=[];
      for(const t of tasks) {
        if(!cancel.has(t.key)||['completed','cancelled'].includes(t.status)) continue;
        const status=['running','dispatching','cancelling'].includes(t.status)?'cancelling':'cancelled';
        await c.query('UPDATE tasks SET status=$2,version=version+1 WHERE id=$1',[t.id,status]);
        await c.query("UPDATE approvals SET status='cancelled',version=version+1 WHERE task_id=$1 AND status='pending'",[t.id]);
        await store.event(c,`task.${status}`,task.project_id,t.id); cancelled.push(t.id);
      }
      await store.audit(c,'task.cancel',task.project_id,{taskId,descendants:cancelled});
      return {tasks:cancelled};
    });
  });
  app.post('/api/v1/tasks/:id/retry',async request=>{
    const taskId=params.parse(request.params).id;
    const body=z.object({version,reconciled:z.literal(true),evidence:text}).strict().parse(request.body);
    return store.tx(async c=>{
      await c.query('SELECT pg_advisory_xact_lock(884023)');
      const task=(await c.query('SELECT * FROM tasks WHERE id=$1 FOR UPDATE',[taskId])).rows[0];
      if(!task) throw new Missing('Tarea inexistente.');
      if(task.version!==body.version || !['failed','needs_reconciliation','cancelled','blocked'].includes(task.status)) throw new Conflict('Tarea no reintentable en esta versión.');
      const attempts=(await c.query('SELECT * FROM attempts WHERE task_id=$1 FOR UPDATE',[taskId])).rows;
      if(attempts.length>=3) throw new Conflict('Límite de reintentos alcanzado.');
      for(const a of attempts) if(a.usage===null) {
        await c.query('UPDATE projects SET reserved=reserved-$2,consumed=consumed+$2 WHERE id=$1',[task.project_id,a.reservation]);
        await c.query("UPDATE attempts SET usage=reservation,usage_estimated=true,status='reconciled',finished_at=now() WHERE id=$1",[a.id]);
      }
      await c.query("UPDATE tasks SET status='ready',version=version+1 WHERE id=$1",[taskId]);
      await store.audit(c,'task.retry',task.project_id,{taskId,evidence:body.evidence});
      await store.event(c,'task.ready',task.project_id,taskId,{reason:'owner_reconciled'});
      return {status:'ready'};
    });
  });
  app.post('/api/v1/approvals/:id/resolve',async request=>{
    const approvalId=params.parse(request.params).id;
    const body=z.object({version,actionHash:z.string().regex(/^[a-f0-9]{64}$/),decision:z.enum(['approved','denied'])}).strict().parse(request.body);
    return store.tx(async c=>{
      await c.query('SELECT pg_advisory_xact_lock(884023)');
      const approval=(await c.query('SELECT * FROM approvals WHERE id=$1 FOR UPDATE',[approvalId])).rows[0];
      if(!approval) throw new Missing('Aprobación inexistente.');
      if(approval.version!==body.version||approval.status!=='pending'||approval.action_hash!==body.actionHash||new Date(approval.expires_at)<=new Date()) throw new Conflict('Aprobación modificada, resuelta o vencida.');
      const task=(await c.query('SELECT * FROM tasks WHERE id=$1 FOR UPDATE',[approval.task_id])).rows[0];
      if(task.status!=='waiting_approval') throw new Conflict('La tarea ya no espera esta decisión.');
      await c.query('UPDATE approvals SET status=$2,version=version+1 WHERE id=$1',[approvalId,body.decision]);
      const run=(await c.query('SELECT * FROM attempts WHERE id=$1 FOR UPDATE',[approval.attempt_id])).rows[0];
      if(run.usage===null) throw new Conflict('El intento aún está cerrando su checkpoint. Reintentar resolución.');
      const n=Number((await c.query('SELECT count(*) AS n FROM attempts WHERE task_id=$1',[task.id])).rows[0].n);
      const status=body.decision==='approved'&&n<3?'ready':'blocked';
      await c.query('UPDATE tasks SET status=$2,version=version+1 WHERE id=$1',[task.id,status]);
      await store.event(c,'approval.resolved',task.project_id,task.id,{approvalId,decision:body.decision});
      await store.audit(c,'approval.resolve',task.project_id,{approvalId,decision:body.decision});
      return {status:body.decision,taskStatus:status,notice:'Decisión registrada; no ejecuta acciones externas por sí misma.'};
    });
  });
  app.get('/api/v1/artifacts/:id',async(request,reply)=>{
    const artifact=(await store.pool.query('SELECT * FROM artifacts WHERE id=$1',[params.parse(request.params).id])).rows[0];
    if(!artifact) throw new Missing('Artefacto inexistente.');
    return reply.header('Content-Disposition',`attachment; filename="${artifact.name}"`).header('X-Content-Type-Options','nosniff')
      .header('X-Checksum-SHA256',artifact.checksum).type('text/plain; charset=utf-8').send(artifact.content);
  });
  app.get('/api/v1/projects/:id/memories',async request=>{
    const projectId=params.parse(request.params).id;
    await store.snapshot(projectId);
    return {memories:(await store.pool.query(`SELECT * FROM (SELECT DISTINCT ON(key) * FROM memories WHERE project_id=$1 ORDER BY key,revision DESC) latest
      WHERE expires_at IS NULL OR expires_at>now()`,[projectId])).rows};
  });
  app.post('/api/v1/projects/:id/memories',async(request,reply)=>{
    const projectId=params.parse(request.params).id;
    const body=z.object({key:z.string().min(1).max(100),content:text,source:text,expectedRevision:z.number().int().nonnegative(),expiresAt:z.iso.datetime().optional()}).strict().parse(request.body);
    const result=await store.tx(async c=>{
      const project=(await c.query('SELECT id FROM projects WHERE id=$1 FOR UPDATE',[projectId])).rows[0];
      if(!project) throw new Missing('Proyecto inexistente.');
      const revision=Number((await c.query('SELECT COALESCE(MAX(revision),0) AS n FROM memories WHERE project_id=$1 AND key=$2',[projectId,body.key])).rows[0].n);
      if(revision!==body.expectedRevision) throw new Conflict('Revisión de memoria cambió.');
      await c.query('INSERT INTO memories(id,project_id,key,content,source,author,revision,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id(),projectId,body.key,body.content,body.source,'owner',revision+1,body.expiresAt??null]);
      await store.event(c,'memory.created',projectId,null,{key:body.key,revision:revision+1});
      await store.audit(c,'memory.write',projectId,{key:body.key,revision:revision+1});
      return {revision:revision+1};
    });
    return reply.code(201).send(result);
  });
  app.get('/api/v1/projects/:id/messages',async request=>({messages:(await store.pool.query('SELECT * FROM messages WHERE project_id=$1 ORDER BY created_at DESC LIMIT 100',[params.parse(request.params).id])).rows}));
  app.get('/api/v1/projects/:id/audit',async request=>({entries:(await store.pool.query('SELECT * FROM audit WHERE project_id=$1 ORDER BY occurred_at DESC LIMIT 100',[params.parse(request.params).id])).rows}));
  app.get('/api/v1/events',async(request,reply)=>{
    const query=z.object({cursor:z.string().regex(/^\d{1,18}$/).default('0'),projectId:uuid.optional(),stream:z.enum(['true','false']).default('false')}).parse(request.query);
    let cursor=query.cursor;
    const batch=async()=> (await store.pool.query('SELECT * FROM events WHERE sequence>$1 AND ($2::text IS NULL OR project_id=$2) ORDER BY sequence LIMIT 100',[cursor,query.projectId??null])).rows;
    if(query.stream==='false') {
      const events=await batch(); return {events,cursor:events.at(-1)?.sequence??cursor};
    }
    // Read the first batch before hijacking so DB errors retain a normal HTTP status.
    let rows=await batch();
    reply.hijack(); reply.raw.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','X-Accel-Buffering':'no'});
    let closed=false; reply.raw.on('close',()=>{closed=true;});
    try {
      while(!closed&&!closing) {
        for(const row of rows) {
          if(!reply.raw.write(`id: ${row.sequence}\nevent: ${row.type}\ndata: ${JSON.stringify(row)}\n\n`)) { closed=true; break; }
          cursor=row.sequence;
        }
        if(closed) break;
        reply.raw.write(': heartbeat\n\n');
        await new Promise(r=>setTimeout(r,1000));
        if(!closed) rows=await batch();
      }
    } finally { reply.raw.end(); }
  });
}
