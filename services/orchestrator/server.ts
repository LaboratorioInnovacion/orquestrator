import { buildApp } from './app.ts';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválido.');
const app = buildApp({ token: process.env.ORCHESTRATOR_TOKEN ?? '', logger: true });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void app.close().catch(() => { process.exitCode = 1; }); });
}
try {
  await app.listen({ host: process.env.HOST ?? '127.0.0.1', port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
  await app.close();
}
