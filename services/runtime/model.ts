import { z } from 'zod';
export type ChatMessage = { role: 'system'|'user'|'assistant'|'tool'; content?: string|null; tool_calls?: ToolCall[]; tool_call_id?: string };
export type ToolCall = { id: string; type: 'function'; function: {name: string; arguments: string} };
export type ToolSpec = { type: 'function'; function: {name: string; description: string; parameters: Record<string,unknown>} };
export interface ModelProvider {
  name: string;
  complete(messages: ChatMessage[], tools: ToolSpec[], maxTokens: number, signal: AbortSignal): Promise<{message: ChatMessage; tokens: number|null}>;
}
const callSchema = z.object({id:z.string().min(1),type:z.literal('function'),function:z.object({name:z.string(),arguments:z.string()})});
const responseSchema = z.object({
  choices:z.array(z.object({message:z.object({role:z.literal('assistant'),content:z.string().nullable().optional(),tool_calls:z.array(callSchema).max(16).optional()})})).min(1),
  usage:z.object({total_tokens:z.number().int().nonnegative()}).optional()
});
export class ChatProvider implements ModelProvider {
  constructor(public name: string, private baseUrl: string, private key: string) {
    const url = new URL(baseUrl);
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('MODEL_BASE_URL inválida.');
    if (url.protocol === 'http:' && !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('Usar HTTPS para proveedores fuera de loopback.');
  }
  async complete(messages: ChatMessage[], tools: ToolSpec[], maxTokens: number, signal: AbortSignal) {
    const response = await fetch(`${this.baseUrl.replace(/\/$/,'')}/chat/completions`,{
      method:'POST', signal:AbortSignal.any([signal,AbortSignal.timeout(120_000)]),
      headers:{'Content-Type':'application/json',...(this.key ? {Authorization:`Bearer ${this.key}`} : {})},
      body:JSON.stringify({model:this.name,messages,max_tokens:maxTokens,...(tools.length ? {tools} : {})})
    });
    // Never log provider bodies or credentials; no automatic retry after an ambiguous request.
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Proveedor rechazó inferencia: HTTP ${response.status}`); }
    const reader = response.body!.getReader();
    const parts: Uint8Array[] = []; let size = 0;
    while (true) {
      const {done,value} = await reader.read(); if(done) break;
      size+=value.length;
      if (size>1024*1024) { await reader.cancel(); throw new Error('Respuesta de modelo demasiado grande.'); }
      parts.push(value);
    }
    const result=responseSchema.parse(JSON.parse(Buffer.concat(parts).toString('utf8')));
    return {message:result.choices[0].message,tokens:result.usage?.total_tokens ?? null};
  }
}
