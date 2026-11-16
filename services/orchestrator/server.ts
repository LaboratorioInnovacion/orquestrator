import { buildApp } from './app.ts';
import { Store } from '../../packages/database/store.ts';
import { ChatProvider } from '../runtime/model.ts';
import { Worker } from '../runtime/worker.ts';

const port=Number(process.env.PORT??3000);
if(!Number.isInteger(port)||port<1||port>65535) throw new Error('PORT inválido.');
const token=process.env.ORCHESTRATOR_TOKEN??'';
if(token.length<32) throw new Error('Configurar ORCHESTRATOR_TOKEN con al menos 32 caracteres.');
const store=process.env.DATABASE_URL?new Store(process.env.DATABASE_URL):undefined;
if(store) await store.migrate();
const model=process.env.MODEL_NAME && process.env.MODEL_BASE_URL
  ?new ChatProvider(process.env.MODEL_NAME,process.env.MODEL_BASE_URL,process.env.MODEL_API_KEY??''):undefined;
const worker=store&&model?new Worker(store,model):undefined;
const app=buildApp({token,logger:true,store,runtimeEnabled:!!worker,webhookSecret:process.env.WEBHOOK_SECRET});
app.addHook('onClose',async()=>{await worker?.stop(); await store?.pool.end();});
for(const signal of ['SIGINT','SIGTERM'] as const) process.once(signal,()=>{void app.close().catch(()=>{process.exitCode=1;});});
try {
  await app.listen({host:process.env.HOST??'127.0.0.1',port});
  worker?.start();
} catch {
  app.log.error('No se pudo iniciar el servicio.'); process.exitCode=1; await app.close();
}
