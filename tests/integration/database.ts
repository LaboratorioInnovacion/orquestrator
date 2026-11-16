import { Store,id } from '../../packages/database/store.ts';
export async function isolatedDatabase(url:string) {
  const admin=new Store(url);
  const schema='test_'+id().replaceAll('-','');
  await admin.pool.query(`CREATE SCHEMA ${schema}`);
  const scoped=new URL(url);scoped.searchParams.set('options',`-c search_path=${schema}`);
  const store=new Store(scoped.href);
  return {store,url:scoped.href,async close(){await store.pool.end();await admin.pool.query(`DROP SCHEMA ${schema} CASCADE`);await admin.pool.end();}};
}
