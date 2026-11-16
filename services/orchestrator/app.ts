import Fastify from 'fastify';
import { timingSafeEqual, createHash } from 'node:crypto';
import { registerWebhook } from './webhook.ts';
import { Store } from '../../packages/database/store.ts';
import { registerRoutes } from './routes.ts';
import { readFile } from 'node:fs/promises';
import { validatePlan } from '../../packages/contracts/plan.ts';

export function buildApp({ token, logger = false, store, runtimeEnabled = false, webhookSecret }: { token: string; logger?: boolean; store?: Store; runtimeEnabled?: boolean; webhookSecret?: string }) {
  if (token.length < 32 || token.trim() !== token) throw new Error('ORCHESTRATOR_TOKEN requiere al menos 32 caracteres sin espacios exteriores.');
  const app = Fastify({
    logger: logger ? { redact: ['req.headers.authorization'], level: 'info' } : false,
    bodyLimit: 128 * 1024
  });
  const digest = (value: string) => createHash('sha256').update(value).digest();
  app.addHook('onRequest', async (request, reply) => {
    if (['/api/v1/health/live', '/', '/panel.js', '/panel.css'].includes(request.routeOptions.url ?? '')) return;
    if (webhookSecret && request.routeOptions.url === '/api/v1/webhook') return;
    const provided = request.headers.authorization ?? '';
    if (!timingSafeEqual(digest(provided), digest(`Bearer ${token}`))) {
      return reply.code(401).header('WWW-Authenticate', 'Bearer').send({ error: 'unauthorized' });
    }
  });
  app.get('/api/v1/health/live', async () => ({ status: 'alive' }));
  app.get('/api/v1/health/ready', async (_request, reply) => {
    let database = false;
    try { if (store) { await store.pool.query('SELECT 1'); database = true; } } catch {}
    const ready = database && runtimeEnabled;
    return reply.code(ready ? 200 : 503).send({ status: ready ? 'ready' : 'not_ready', admission: ready,
      reasons: [...(database ? [] : ['database_not_configured_or_unavailable']), ...(runtimeEnabled ? [] : ['model_not_configured'])] });
  });
  app.get('/api/v1/capabilities', async () => ({
    engine: 'orquestrator-native', planValidation: true, persistence: !!store, dispatch: !!store && runtimeEnabled,
    features: { sessions: !!store, tools: !!store, memory: !!store, artifacts: !!store,
      approvals: !!store, review: !!store, events: !!store, tokenBudget: !!store,
      automations: !!store && runtimeEnabled, webhook: !!store && !!webhookSecret, monetaryBudget: false, browser: false, shell: false, externalChannels: false,
      remoteNodes: false, acp: false, multimedia: false, automaticFallback: false },
    openclaw: { required: false }, virtualOffice: { required: false }
  }));
  for (const [url, file, type] of [['/', 'index.html', 'text/html'], ['/panel.js', 'panel.js', 'text/javascript'], ['/panel.css', 'panel.css', 'text/css']]) {
    app.get(url, async (_request, reply) => reply.type(type)
      .header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'")
      .header('X-Content-Type-Options', 'nosniff')
      .send(await readFile(new URL(`../../integrations/web/${file}`, import.meta.url), 'utf8')));
  }
  if (store) { registerRoutes(app, store); if(webhookSecret) registerWebhook(app,store,webhookSecret); }
  app.post('/api/v1/plans/validate', async (request, reply) => {
    const result = validatePlan(request.body);
    return reply.code(result.valid ? 200 : 422).send(result);
  });
  return app;
}
