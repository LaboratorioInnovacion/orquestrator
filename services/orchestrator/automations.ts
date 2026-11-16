import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { Store,Conflict,Missing,id } from '../../packages/database/store.ts';
import { validatePlan } from '../../packages/contracts/plan.ts';
const timezone=z.string().refine(value=>{try{new Intl.DateTimeFormat('es',{timeZone:value});return true;}catch{return false;}},'Zona horaria inválida');

export function registerAutomations(app:FastifyInstance,store:Store) {
  app.get('/api/v1/projects/:id/automations',async request=>{
    const projectId=z.object({id:z.string().uuid()}).parse(request.params).id;
    return {automations:(await store.pool.query('SELECT * FROM automations WHERE project_id=$1 ORDER BY created_at',[projectId])).rows};
  });
  app.post('/api/v1/projects/:id/automations',async(request,reply)=>{
    const projectId=z.object({id:z.string().uuid()}).parse(request.params).id;
    const body=z.object({name:z.string().min(1).max(200),timezone,intervalSeconds:z.number().int().min(60).max(31_536_000),plan:z.unknown()}).strict().parse(request.body);
    const parsed=validatePlan(body.plan);
    if(!parsed.valid) return reply.code(422).send(parsed);
    const created=await store.tx(async c=>{
      const project=(await c.query('SELECT id FROM projects WHERE id=$1 FOR UPDATE',[projectId])).rows[0];
      if(!project) throw new Missing('Proyecto inexistente.');
      const automationId=id();
      await c.query("INSERT INTO automations(id,project_id,name,timezone,interval_seconds,next_at,plan) VALUES($1,$2,$3,$4,$5,now()+$5::integer*interval '1 second',$6)",[automationId,projectId,body.name,body.timezone,body.intervalSeconds,JSON.stringify(parsed.plan)]);
      await store.audit(c,'automation.create',projectId,{automationId});
      return {automationId,paused:true,overlapPolicy:'skip',recoveryPolicy:'one_latest'};
    });
    return reply.code(201).send(created);
  });
  for(const command of ['pause','resume']) app.post(`/api/v1/automations/:id/${command}`,async request=>{
    const automationId=z.object({id:z.string().uuid()}).parse(request.params).id;
    return store.tx(async c=>{
      const result=(await c.query('UPDATE automations SET paused=$2,next_at=now()+interval_seconds*interval \'1 second\' WHERE id=$1 RETURNING *',[automationId,command==='pause'])).rows[0];
      if(!result) throw new Missing('Automatización inexistente.');
      await store.audit(c,`automation.${command}`,result.project_id,{automationId});
      return {paused:result.paused};
    });
  });
}
export async function tickAutomations(store:Store) {
  await store.tx(async c=>{
    await c.query('SELECT pg_advisory_xact_lock(884025)');
    const automations=(await c.query('SELECT * FROM automations WHERE paused=false AND next_at<=now() ORDER BY next_at LIMIT 20 FOR UPDATE SKIP LOCKED')).rows;
    for(const a of automations) {
      const receipt=await c.query("INSERT INTO occurrences(automation_id,scheduled_at,status) VALUES($1,$2,'received') ON CONFLICT DO NOTHING RETURNING *",[a.id,a.next_at]);
      await c.query("UPDATE automations SET next_at=now()+interval_seconds*interval '1 second' WHERE id=$1",[a.id]);
      if(!receipt.rowCount) continue;
      const project=(await c.query('SELECT * FROM projects WHERE id=$1 FOR UPDATE',[a.project_id])).rows[0];
      const unfinished=(await c.query("SELECT id FROM tasks WHERE project_id=$1 AND status NOT IN ('completed','failed','blocked','cancelled') LIMIT 1",[a.project_id])).rowCount;
      const parsed=validatePlan(a.plan);
      let status='skipped';
      if(!project.paused&&!unfinished&&parsed.valid) {
        const revision=Number((await c.query('SELECT COALESCE(MAX(revision),0)+1 AS n FROM plans WHERE project_id=$1',[a.project_id])).rows[0].n);
        await store.insertPlan(c,a.project_id,{...parsed.plan,revision}); status='planned';
      }
      await c.query('UPDATE occurrences SET status=$3 WHERE automation_id=$1 AND scheduled_at=$2',[a.id,a.next_at,status]);
      await store.event(c,`automation.${status}`,a.project_id,null,{automationId:a.id,scheduledAt:a.next_at});
    }
  });
}
