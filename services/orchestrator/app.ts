import Fastify from 'fastify';
import { timingSafeEqual, createHash } from 'node:crypto';
import { validatePlan } from '../../packages/contracts/plan.ts';

export function buildApp({ token, logger = false }: { token: string; logger?: boolean }) {
  if (token.length < 32 || token.trim() !== token) throw new Error('ORCHESTRATOR_TOKEN requiere al menos 32 caracteres sin espacios exteriores.');
  const app = Fastify({
    logger: logger ? { redact: ['req.headers.authorization'], level: 'info' } : false,
    bodyLimit: 128 * 1024
  });
  const digest = (value: string) => createHash('sha256').update(value).digest();
  app.addHook('onRequest', async (request, reply) => {
    if (request.routeOptions.url === '/api/v1/health/live') return;
    const provided = request.headers.authorization ?? '';
    if (!timingSafeEqual(digest(provided), digest(`Bearer ${token}`))) {
      return reply.code(401).header('WWW-Authenticate', 'Bearer').send({ error: 'unauthorized' });
    }
  });
  app.get('/api/v1/health/live', async () => ({ status: 'alive' }));
  app.get('/api/v1/health/ready', async (_request, reply) => reply.code(503).send({
    status: 'not_ready', admission: false,
    reasons: ['database_not_configured', 'runtime_not_verified']
  }));
  app.get('/api/v1/capabilities', async () => ({
    planValidation: true,
    persistence: false,
    dispatch: false,
    openclaw: { verified: false },
    virtualOffice: { verified: false }
  }));
  app.post('/api/v1/plans/validate', async (request, reply) => {
    const result = validatePlan(request.body);
    return reply.code(result.valid ? 200 : 422).send(result);
  });
  return app;
}
