import { Store } from '../packages/database/store.ts';
if(!process.env.DATABASE_URL) throw new Error('Configurar DATABASE_URL.');
const store=new Store(process.env.DATABASE_URL);
try {await store.migrate();console.log('Migraciones aplicadas.');} finally {await store.pool.end();}
