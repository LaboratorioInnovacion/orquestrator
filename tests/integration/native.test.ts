import { isolatedDatabase } from './database.ts';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store,id } from '../../packages/database/store.ts';
import { buildApp } from '../../services/orchestrator/app.ts';
import { Worker } from '../../services/runtime/worker.ts';
import { executeTool } from '../../services/runtime/tools.ts';
import { tickAutomations } from '../../services/orchestrator/automations.ts';
import type { ChatMessage,ModelProvider } from '../../services/runtime/model.ts';
const url=process.env.TEST_DATABASE_URL;
const token='integration-test-owner-token-at-least-32';
const headers={authorization:`Bearer ${token}`};
const makeTask=(key:string,dependsOn:string[]=[])=>({key,role:'executor',dependsOn,deliverable:`${key}.md`,criteria:['Contenido verificable']});
const plan=(tasks=[makeTask('a')])=>({objective:'Crear informe',revision:1,tasks});

test('native orchestration with real PostgreSQL', {skip:!url},async t=>{
  const database=await isolatedDatabase(url!);const store=database.store;await store.migrate();
  const app=buildApp({token,store,runtimeEnabled:true});
  const projectIds:string[]=[];
  t.after(async()=>{await app.close();await database.close();});
  async function project() {
    const body={source:'integration',externalId:id(),name:'Prueba',objective:'Objetivo verificable',tokenLimit:1_000_000,planAutomatically:false};
    const response=await app.inject({method:'POST',url:'/api/v1/requests',headers,payload:body});
    assert.equal(response.statusCode,201,response.body);
    const projectId=response.json().projectId;projectIds.push(projectId);
    return {projectId,body};
  }
  async function addPlan(projectId:string,definition=plan()) {
    const response=await app.inject({method:'POST',url:`/api/v1/projects/${projectId}/plans`,headers,payload:definition});
    assert.equal(response.statusCode,201,response.body);
    return response.json();
  }
  async function resume(projectId:string) {
    const response=await app.inject({method:'POST',url:`/api/v1/projects/${projectId}/resume`,headers,payload:{}});
    assert.equal(response.statusCode,200,response.body);
  }
  const model:ModelProvider={name:'deterministic-contract-test',async complete(messages) {
    const hasTool=messages.some(m=>m.role==='tool');
    return {tokens:100,message:hasTool?{role:'assistant',content:'Informe con contenido verificable.'}:{role:'assistant',content:null,tool_calls:[{id:id(),type:'function',function:{name:'write_file',arguments:JSON.stringify({name:'report.md',content:'Evidencia verificable'})}}]}};
  }};
  const worker=new Worker(store,model);
  await t.test('request idempotency and conflicting body',async()=>{
    const {projectId,body}=await project();
    const duplicate=await app.inject({method:'POST',url:'/api/v1/requests',headers,payload:body});
    assert.equal(duplicate.statusCode,200);assert.equal(duplicate.json().projectId,projectId);
    const conflict=await app.inject({method:'POST',url:'/api/v1/requests',headers,payload:{...body,name:'Otro'}});
    assert.equal(conflict.statusCode,409);
  });
  await t.test('parallel claims, tools, independent review and fan-in',async()=>{
    const {projectId}=await project();await addPlan(projectId,plan([makeTask('review',['a','b']),makeTask('a'),makeTask('b')]));await resume(projectId);
    const contexts=await Promise.all([worker.claim(),worker.claim(),worker.claim()]);
    assert.equal(contexts.filter(Boolean).length,2);
    await Promise.all(contexts.filter(Boolean).map(ctx=>worker.run(ctx!,new AbortController().signal)));
    let snapshot=await store.snapshot(projectId);
    const delivered=snapshot.tasks.filter(task=>task.status==='reviewing');assert.equal(delivered.length,2);
    assert.equal(await worker.claim(),null);
    for(const task of delivered) {
      const results=await Promise.all([1,2].map(()=>app.inject({method:'POST',url:`/api/v1/tasks/${task.id}/review`,headers,payload:{version:task.version,decision:'accept',evidence:'Se comprobó contenido y criterio.'}})));
      assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);
    }
    const review=await worker.claim();assert.ok(review);assert.equal(review!.role,'executor');
    await worker.run(review!,new AbortController().signal);
    snapshot=await store.snapshot(projectId);
    const task=snapshot.tasks.find(task=>task.key==='review');
    const detail=(await app.inject({url:`/api/v1/tasks/${task.id}`,headers})).json();
    assert.equal(detail.attempts.length,1);assert.ok(detail.attempts[0].checkpoint.length>=4);
    const file=detail.artifacts.find((a:any)=>a.name==='report.md');
    assert.equal((await app.inject({url:`/api/v1/artifacts/${file.id}`})).statusCode,401);
    const download=await app.inject({url:`/api/v1/artifacts/${file.id}`,headers});assert.equal(download.body,'Evidencia verificable');
    assert.ok(download.headers['x-checksum-sha256']);
    // Close manual review so it doesn't reserve slots for subsequent tests.
    await app.inject({method:'POST',url:`/api/v1/tasks/${task.id}/review`,headers,payload:{version:task.version,decision:'accept',evidence:'Correcto.'}});
    assert.equal((await store.snapshot(projectId)).project.reserved,'0');
  });
  await t.test('artifacts reject traversal; memory is isolated',async()=>{
    const {projectId}=await project();await addPlan(projectId);await resume(projectId);
    const ctx=await worker.claim();assert.ok(ctx);
    await assert.rejects(executeTool(store,ctx!,'write_file',{name:'../secret',content:'bad'}));
    await executeTool(store,ctx!,'remember',{key:'decision',content:'Dato privado proyecto A',source:'Prueba'});
    const recalled=await executeTool(store,ctx!,'recall',{query:'privado'});assert.equal((recalled as any).entries.length,1);
    await worker.run(ctx!,new AbortController().signal);
    const other=await project();
    const response=await app.inject({url:`/api/v1/projects/${other.projectId}/memories`,headers});assert.deepEqual(response.json().memories,[]);
    await store.pool.query("UPDATE tasks SET status='completed' WHERE project_id=$1",[projectId]);
  });
  await t.test('approval is exact, expires and resolves only once',async()=>{
    const {projectId}=await project();await addPlan(projectId);await resume(projectId);
    const approvalModel:ModelProvider={name:'approval-contract',async complete(){return {tokens:50,message:{role:'assistant',tool_calls:[{id:id(),type:'function',function:{name:'request_approval',arguments:JSON.stringify({action:'Publicar borrador',parameters:{destination:'test-only'}})}}]}};}};
    const approvalWorker=new Worker(store,approvalModel);
    const ctx=await approvalWorker.claim();assert.ok(ctx);await approvalWorker.run(ctx!,new AbortController().signal);
    const approval=(await store.pool.query('SELECT * FROM approvals WHERE task_id=$1',[ctx!.taskId])).rows[0];
    const wrong=await app.inject({method:'POST',url:`/api/v1/approvals/${approval.id}/resolve`,headers,payload:{version:1,actionHash:'0'.repeat(64),decision:'approved'}});assert.equal(wrong.statusCode,409);
    const results=await Promise.all([1,2].map(()=>app.inject({method:'POST',url:`/api/v1/approvals/${approval.id}/resolve`,headers,payload:{version:1,actionHash:approval.action_hash,decision:'denied'}})));
    assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);
  });
  await t.test('expired lease requires reconciliation; budget remains reserved',async()=>{
    const {projectId}=await project();await addPlan(projectId);await resume(projectId);
    const ctx=await worker.claim();assert.ok(ctx);
    await store.pool.query("UPDATE attempts SET lease_until=now()-interval '1 second' WHERE id=$1",[ctx!.attemptId]);
    await worker.recover();
    const snapshot=await store.snapshot(projectId);const task=snapshot.tasks[0];
    assert.equal(task.status,'needs_reconciliation');assert.equal(await worker.claim(),null);
    const retry=await app.inject({method:'POST',url:`/api/v1/tasks/${task.id}/retry`,headers,payload:{version:task.version,reconciled:true,evidence:'Proveedor de prueba confirma ausencia de efectos externos.'}});
    assert.equal(retry.statusCode,200,retry.body);
    const renewed=await store.snapshot(projectId);assert.equal(renewed.project.reserved,'0');assert.equal(renewed.project.consumed,'16000');
    await store.pool.query('UPDATE projects SET paused=true WHERE id=$1',[projectId]);
  });
  await t.test('automation occurrence is deduplicated and never overlaps',async()=>{
    const {projectId}=await project();await resume(projectId);
    const response=await app.inject({method:'POST',url:`/api/v1/projects/${projectId}/automations`,headers,payload:{name:'Intervalo',timezone:'America/Argentina/Catamarca',intervalSeconds:60,plan:plan()}});
    assert.equal(response.statusCode,201,response.body);const automationId=response.json().automationId;
    await store.pool.query("UPDATE automations SET paused=false,next_at=now()-interval '1 minute' WHERE id=$1",[automationId]);
    await Promise.all([tickAutomations(store),tickAutomations(store)]);
    assert.equal((await store.snapshot(projectId)).plans.length,1);
    const occurrences=(await store.pool.query('SELECT * FROM occurrences WHERE automation_id=$1',[automationId])).rows;assert.equal(occurrences.length,1);
    await store.pool.query("UPDATE automations SET next_at=now()-interval '1 minute' WHERE id=$1",[automationId]);await tickAutomations(store);
    assert.equal((await store.snapshot(projectId)).plans.length,1);
    await store.pool.query('UPDATE projects SET paused=true WHERE id=$1',[projectId]);
  });
  await t.test('events replay cursor is monotonic and snapshot is durable across Store instances',async()=>{
    const {projectId}=await project();
    const first=(await app.inject({url:`/api/v1/events?projectId=${projectId}`,headers})).json();
    assert.ok(first.events.length>0);
    const next=(await app.inject({url:`/api/v1/events?projectId=${projectId}&cursor=${first.cursor}`,headers})).json();assert.equal(next.events.length,0);
    const reopened=new Store(database.url);assert.equal((await reopened.snapshot(projectId)).project.id,projectId);await reopened.pool.end();
  });
  await t.test('objective creates a coordinator and owner acceptance registers the proposed DAG',async()=>{
    const body={source:'integration',externalId:id(),name:'Planificación',objective:'Comparar opciones',tokenLimit:1_000_000,planAutomatically:true};
    const response=await app.inject({method:'POST',url:'/api/v1/requests',headers,payload:body});
    const projectId=response.json().projectId;projectIds.push(projectId);await resume(projectId);
    const planner:ModelProvider={name:'planner-contract',async complete(messages) {
      return {tokens:100,message:messages.some(m=>m.role==='tool')?{role:'assistant',content:'Propuesta lista para revisión.'}:{role:'assistant',tool_calls:[{id:id(),type:'function',function:{name:'propose_plan',arguments:JSON.stringify({plan:plan([makeTask('a'),makeTask('b'),makeTask('review',['a','b'])])})}}]}};
    }};
    const plannerWorker=new Worker(store,planner);const ctx=await plannerWorker.claim();assert.ok(ctx);assert.equal(ctx!.role,'coordinator');
    await plannerWorker.run(ctx!,new AbortController().signal);
    const snapshot=await store.snapshot(projectId);const task=snapshot.tasks[0];assert.equal(task.status,'reviewing');assert.equal(snapshot.plans.length,1);
    const accepted=await app.inject({method:'POST',url:`/api/v1/tasks/${task.id}/review`,headers,payload:{version:task.version,decision:'accept',evidence:'DAG, criterios y alcance comprobados.'}});
    assert.equal(accepted.statusCode,200,accepted.body);assert.equal((await store.snapshot(projectId)).plans.length,2);
    await store.pool.query('UPDATE projects SET paused=true WHERE id=$1',[projectId]);
  });
  await t.test('cancellation propagates descendants; exhausted budget admits no inference',async()=>{
    const {projectId}=await project();await addPlan(projectId,plan([makeTask('a'),makeTask('b',['a'])]));await resume(projectId);
    await store.pool.query('UPDATE projects SET token_limit=1000 WHERE id=$1',[projectId]);
    assert.equal(await worker.claim(),null);
    const budget=await app.inject({method:'POST',url:`/api/v1/projects/${projectId}/budget`,headers,payload:{expectedTokenLimit:1000,tokenLimit:100000}});assert.equal(budget.statusCode,200,budget.body);
    const stale=await app.inject({method:'POST',url:`/api/v1/projects/${projectId}/budget`,headers,payload:{expectedTokenLimit:1000,tokenLimit:200000}});assert.equal(stale.statusCode,409);
    const task=(await store.snapshot(projectId)).tasks.find(t=>t.key==='a');
    const result=await app.inject({method:'POST',url:`/api/v1/tasks/${task.id}/cancel`,headers,payload:{version:task.version}});
    assert.equal(result.statusCode,200,result.body);assert.equal(result.json().tasks.length,2);
    assert.ok((await store.snapshot(projectId)).tasks.every(t=>t.status==='cancelled'));
  });
  await t.test('signed webhook deduplicates delivery and rejects stale timestamps',async()=>{
    const secret='separate-webhook-secret-with-at-least-32-characters';
    const webhookApp=buildApp({token,store,webhookSecret:secret});
    try {
      const payload={eventId:id(),name:'Webhook',objective:'Procesar evento recibido',tokenLimit:100000};
      const timestamp=String(Math.floor(Date.now()/1000));
      const signature='sha256='+createHmac('sha256',secret).update(`${timestamp}.${JSON.stringify(payload)}`).digest('hex');
      const options={method:'POST' as const,url:'/api/v1/webhook',headers:{'x-webhook-timestamp':timestamp,'x-webhook-signature':signature},payload};
      const first=await webhookApp.inject(options);assert.equal(first.statusCode,202,first.body);projectIds.push(first.json().projectId);
      const second=await webhookApp.inject(options);assert.equal(second.json().duplicate,true);
      assert.equal((await webhookApp.inject({...options,headers:{...options.headers,'x-webhook-timestamp':'1000000000'}})).statusCode,403);
      assert.equal((await webhookApp.inject({method:'POST',url:'/api/v1/webhook',payload})).statusCode,403);
    } finally {await webhookApp.close();}
  });
  await t.test('waiting_input preserves question and resumes with an owner answer',async()=>{
    const {projectId}=await project();await addPlan(projectId);await resume(projectId);
    const inputModel:ModelProvider={name:'input-contract',async complete(){return {tokens:50,message:{role:'assistant',tool_calls:[{id:id(),type:'function',function:{name:'request_input',arguments:JSON.stringify({question:'¿Qué formato necesitas?'})}}]}};}};
    const inputWorker=new Worker(store,inputModel);const ctx=await inputWorker.claim();assert.ok(ctx);await inputWorker.run(ctx!,new AbortController().signal);
    const task=(await store.snapshot(projectId)).tasks[0];assert.equal(task.status,'waiting_input');
    const answer=await app.inject({method:'POST',url:`/api/v1/tasks/${task.id}/input`,headers,payload:{version:task.version,content:'Markdown con fuentes.'}});assert.equal(answer.statusCode,200,answer.body);
    const continued=await worker.claim();assert.ok(continued);assert.ok(continued!.dependencyContext.includes('Markdown con fuentes.'));
    await worker.run(continued!,new AbortController().signal);
    await store.pool.query("UPDATE tasks SET status='completed' WHERE id=$1",[task.id]);
  });
  await t.test('SSE delivers committed events and closes after client abort',async()=>{
    const {projectId}=await project();
    const address=await app.listen({host:'127.0.0.1',port:0});
    const controller=new AbortController();
    const response=await fetch(`${address}/api/v1/events?projectId=${projectId}&stream=true`,{headers,signal:controller.signal});
    assert.equal(response.status,200);assert.ok(response.headers.get('content-type')?.includes('text/event-stream'));
    const reader=response.body!.getReader();const first=await reader.read();
    assert.ok(new TextDecoder().decode(first.value).includes('request.accepted'));
    controller.abort();await reader.cancel().catch(()=>{});
  });
  // Retain no test work that a running worker could accidentally admit.
  for(const projectId of projectIds) await store.pool.query('UPDATE projects SET paused=true WHERE id=$1',[projectId]);
});
