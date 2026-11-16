import type { FastifyInstance } from 'fastify';
import { createHmac,timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Store } from '../../packages/database/store.ts';
export function registerWebhook(app:FastifyInstance,store:Store,secret:string) {
  if(secret.length<32) throw new Error('WEBHOOK_SECRET requiere al menos 32 caracteres.');
  app.post('/api/v1/webhook',async(request,reply)=>{
    const timestamp=request.headers['x-webhook-timestamp'];
    const signature=request.headers['x-webhook-signature'];
    if(typeof timestamp!=='string'||!/^\d{10}$/.test(timestamp)||Math.abs(Date.now()/1000-Number(timestamp))>300||typeof signature!=='string'||!/^sha256=[a-f0-9]{64}$/.test(signature)) return reply.code(403).send({error:'invalid_signature'});
    const expected=createHmac('sha256',secret).update(`${timestamp}.${JSON.stringify(request.body)}`).digest('hex');
    if(!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(signature.slice(7),'hex'))) return reply.code(403).send({error:'invalid_signature'});
    const body=z.object({eventId:z.string().min(1).max(200),name:z.string().min(1).max(200),objective:z.string().min(1).max(8000),tokenLimit:z.number().int().min(1000).max(100_000_000)}).strict().parse(request.body);
    const result=await store.request({source:'webhook',externalId:body.eventId,name:body.name,objective:body.objective,tokenLimit:body.tokenLimit,planAutomatically:true});
    return reply.code(202).send({...result,status:'received',paused:true});
  });
}
