import { Pool, type PoolClient } from 'pg';
import { readFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import type { Plan } from '../contracts/plan.ts';
export const id = () => randomUUID();
export const hash = (content: string) => createHash('sha256').update(content).digest('hex');
export class Conflict extends Error {}
export class Missing extends Error {}
export class Store {
  pool: Pool;
  constructor(url: string) { this.pool = new Pool({ connectionString: url, max: 10 }); }
  async migrate() {
    await this.tx(async c => {
      await c.query('SELECT pg_advisory_xact_lock(884021)');
      await c.query('CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
      const sql=await readFile(new URL('./001-initial.sql', import.meta.url), 'utf8');
      const checksum=hash(sql);
      const migration=(await c.query('SELECT checksum FROM schema_migrations WHERE version=1')).rows[0];
      if(migration && migration.checksum!==checksum) throw new Error('Migración aplicada cambió; crear otra migración.');
      if(!migration) {
        await c.query(sql);
        await c.query('INSERT INTO schema_migrations(version,checksum) VALUES(1,$1)',[checksum]);
      }
    });
  }
  async tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try { await c.query('BEGIN'); const result = await fn(c); await c.query('COMMIT'); return result; }
    catch (error) { await c.query('ROLLBACK'); throw error; }
    finally { c.release(); }
  }
  async event(c: PoolClient, type: string, projectId: string | null, taskId: string | null, payload: unknown = {}) {
    // Serialize event allocation until commit so SSE cursors cannot skip late commits.
    await c.query('SELECT pg_advisory_xact_lock(884026)');
    await c.query('INSERT INTO events(id,project_id,task_id,type,payload) VALUES($1,$2,$3,$4,$5)',
      [id(), projectId, taskId, type, JSON.stringify(payload)]);
  }
  async audit(c: PoolClient, operation: string, projectId: string, payload: unknown = {}) {
    await c.query('INSERT INTO audit(id,actor,operation,project_id,payload) VALUES($1,$2,$3,$4,$5)',
      [id(), 'owner', operation, projectId, JSON.stringify(payload)]);
  }
  async request(input: { source: string; externalId: string; name: string; objective: string; tokenLimit: number; planAutomatically?: boolean }) {
    return this.tx(async c => {
      await c.query('SELECT pg_advisory_xact_lock(884022)');
      const bodyHash = hash(JSON.stringify(input));
      const previous = (await c.query('SELECT * FROM requests WHERE source=$1 AND external_id=$2', [input.source, input.externalId])).rows[0];
      if (previous) {
        if (previous.body_hash !== bodyHash) throw new Conflict('Idempotency key reutilizada con otro contenido.');
        return { projectId: previous.project_id, duplicate: true };
      }
      const projectId = id();
      await c.query('INSERT INTO projects(id,name,objective,token_limit) VALUES($1,$2,$3,$4)', [projectId,input.name,input.objective,input.tokenLimit]);
      await c.query('INSERT INTO requests(id,source,external_id,body_hash,project_id) VALUES($1,$2,$3,$4,$5)',
        [id(),input.source,input.externalId,bodyHash,projectId]);
      await this.event(c,'request.accepted',projectId,null);
      if(input.planAutomatically) await this.insertPlan(c,projectId,{
        objective:input.objective,revision:1,
        tasks:[{key:'plan-objective',role:'coordinator',dependsOn:[],deliverable:'proposed-plan.json',criteria:['Plan válido con tareas, dependencias y criterios verificables; usar propose_plan.']}]
      });
      await this.audit(c,'request.create',projectId);
      return { projectId, duplicate: false };
    });
  }
  async savePlan(projectId: string, plan: Plan) {
    return this.tx(async c => {
      const project = (await c.query('SELECT * FROM projects WHERE id=$1 FOR UPDATE',[projectId])).rows[0];
      if (!project) throw new Missing('Proyecto inexistente.');
      const last = Number((await c.query('SELECT COALESCE(MAX(revision),0) AS revision FROM plans WHERE project_id=$1',[projectId])).rows[0].revision);
      if (plan.revision !== last + 1) throw new Conflict(`Se esperaba revisión ${last+1}.`);
      const active = await c.query("SELECT id FROM tasks WHERE project_id=$1 AND status NOT IN ('completed','cancelled','failed','blocked') LIMIT 1",[projectId]);
      if (active.rowCount) throw new Conflict('Cerrar o cancelar el plan anterior antes de registrar otra revisión.');
      return this.insertPlan(c,projectId,plan);
    });
  }
  async insertPlan(c: PoolClient, projectId: string, plan: Plan) {
    const planId = id();
    await c.query('INSERT INTO plans(id,project_id,revision,definition) VALUES($1,$2,$3,$4)',[planId,projectId,plan.revision,JSON.stringify(plan)]);
    for (const task of plan.tasks) {
      const taskId = id();
      await c.query('INSERT INTO tasks(id,project_id,plan_id,key,role,instructions,criteria,depends_on,workspace) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [taskId,projectId,planId,task.key,task.role,`${plan.objective}\nEntregable: ${task.deliverable}`,JSON.stringify(task.criteria),JSON.stringify(task.dependsOn),`${projectId}/${taskId}`]);
    }
    await this.event(c,'plan.created',projectId,null,{planId,revision:plan.revision});
    await this.audit(c,'plan.create',projectId,{planId});
    return {planId};
  }
  async snapshot(projectId: string) {
    return this.tx(async c => {
      await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      const project = (await c.query('SELECT * FROM projects WHERE id=$1',[projectId])).rows[0];
      if (!project) throw new Missing('Proyecto inexistente.');
      const tasks = (await c.query('SELECT * FROM tasks WHERE project_id=$1 ORDER BY created_at,id',[projectId])).rows;
      const plans = (await c.query('SELECT * FROM plans WHERE project_id=$1 ORDER BY revision',[projectId])).rows;
      const cursor = (await c.query('SELECT COALESCE(MAX(sequence),0) AS cursor FROM events')).rows[0].cursor;
      return {project,tasks,plans,cursor};
    });
  }
}
