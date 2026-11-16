import { pathToFileURL } from 'node:url';

// Discovery only: no authentication, dispatch, or inference.
export function probeGateway(address, { timeoutMs = 5000, Socket = WebSocket } = {}) {
  const url = new URL(address);
  if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Use ws:// o wss:// sin credenciales, query ni fragmento.');
  }
  return new Promise((resolve, reject) => {
    const socket = new Socket(url.href);
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      if (error) reject(error);
      else resolve({ challengeReceived: true, authenticated: false, sessionVerified: false });
    };
    const timer = setTimeout(() => finish(new Error('Timeout esperando challenge del Gateway.')), timeoutMs);
    socket.addEventListener('message', ({ data }) => {
      let frame;
      try { frame = JSON.parse(String(data)); }
      catch { finish(new Error('El Gateway envió JSON inválido.')); return; }
      if (frame?.type === 'event' && frame.event === 'connect.challenge' &&
          typeof frame.payload?.nonce === 'string' && frame.payload.nonce.length > 0) finish();
      else finish(new Error('El primer mensaje no es un challenge válido de OpenClaw.'));
    });
    socket.addEventListener('error', () => finish(new Error('No se pudo conectar al Gateway.')));
    socket.addEventListener('close', () => finish(new Error('Conexión cerrada antes del challenge.')));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await probeGateway(process.env.OPENCLAW_GATEWAY_URL ?? 'ws://127.0.0.1:18789')));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
