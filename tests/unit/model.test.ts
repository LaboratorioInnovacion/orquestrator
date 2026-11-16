import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { ChatProvider } from '../../services/runtime/model.ts';
async function fixture(handler:(body:any)=>{status:number;body:unknown}) {
  const server=createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req) chunks.push(chunk);
    const result=handler(JSON.parse(Buffer.concat(chunks).toString()));
    res.writeHead(result.status,{'Content-Type':'application/json'});res.end(JSON.stringify(result.body));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=(server.address() as any).port;
  return {model:new ChatProvider('contract-model',`http://127.0.0.1:${port}/v1`,'test-key'),close:()=>new Promise<void>(resolve=>server.close(()=>resolve()))};
}
test('native model client sends messages/tools and parses usage over HTTP',async t=>{
  const f=await fixture(body=>{
    assert.equal(body.model,'contract-model');assert.equal(body.max_tokens,128);assert.equal(body.messages[0].content,'Objetivo');
    return {status:200,body:{choices:[{message:{role:'assistant',content:'Resultado'}}],usage:{total_tokens:20}}};
  });t.after(f.close);
  const result=await f.model.complete([{role:'user',content:'Objetivo'}],[],128,new AbortController().signal);
  assert.equal(result.message.content,'Resultado');assert.equal(result.tokens,20);
});
test('unknown usage stays unknown rather than claiming zero',async t=>{
  const f=await fixture(()=>({status:200,body:{choices:[{message:{role:'assistant',content:'Texto'}}]}}));t.after(f.close);
  assert.equal((await f.model.complete([],[],10,new AbortController().signal)).tokens,null);
});
test('provider errors are bounded and do not expose body or retry blindly',async t=>{
  let calls=0;const f=await fixture(()=>{calls++;return {status:429,body:{secret:'do-not-expose'}};});t.after(f.close);
  await assert.rejects(f.model.complete([],[],10,new AbortController().signal),/HTTP 429/);assert.equal(calls,1);
});
test('malformed provider responses are rejected',async t=>{
  const f=await fixture(()=>({status:200,body:{choices:[]}}));t.after(f.close);
  await assert.rejects(f.model.complete([],[],10,new AbortController().signal));
});
test('public plaintext and credential-bearing model URLs are rejected',()=>{
  assert.throws(()=>new ChatProvider('m','http://example.com/v1','key'));
  assert.throws(()=>new ChatProvider('m','https://user:pass@example.com/v1','key'));
});
