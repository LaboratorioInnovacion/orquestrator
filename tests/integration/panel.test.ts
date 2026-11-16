import { isolatedDatabase } from './database.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { Store } from '../../packages/database/store.ts';
import { buildApp } from '../../services/orchestrator/app.ts';

test('owner can create an objective from the web panel', {skip:!process.env.TEST_DATABASE_URL||!process.env.CHROMIUM_PATH},async t=>{
  const database=await isolatedDatabase(process.env.TEST_DATABASE_URL!);const store=database.store;await store.migrate();
  const app=buildApp({token:'panel-test-owner-token-with-32-characters',store});
  const address=await app.listen({host:'127.0.0.1',port:0});
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
  t.after(async()=>{await browser.close();await app.close();await database.close();});
  const page=await browser.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(address);
  await page.getByLabel('Token del propietario').fill('panel-test-owner-token-with-32-characters');
  await page.getByRole('button',{name:'Conectar',exact:true}).click();
  await page.getByLabel('Nombre',{exact:true}).fill('<img src=x onerror=alert(1)>');
  await page.getByLabel('Objetivo',{exact:true}).fill('Crear un informe verificable');
  await page.getByRole('button',{name:'Crear proyecto pausado'}).click();
  await page.locator('#project-name').filter({hasText:'<img src=x onerror=alert(1)>'}).waitFor();
  assert.equal(await page.locator('#project-name img').count(),0);
  assert.equal(await page.locator('#tasks').innerText().then(t=>t.includes('plan-objective')),true);
  assert.deepEqual(errors,[]);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await page.getByRole('button',{name:'Desconectar',exact:true}).click();
  assert.equal(await page.locator('#auth').isVisible(),true);
});
