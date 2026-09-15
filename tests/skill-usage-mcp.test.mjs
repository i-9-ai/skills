import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { openUsageStore } from '../src/infrastructure/skill-usage-store.mjs';
const server = path.resolve('src/skill-usage-mcp.mjs');
const event = id => ({event_id:id,collection:'demo',skill:'console',revision:'sha256:abc',session:'session-a',occurred_at:'2026-09-15T12:00:00.000Z'});
function fixture(t) { const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'usage-test-'))); t.after(()=>fs.rmSync(dir,{recursive:true,force:true})); return path.join(dir,'usage.db'); }
test('read retries, conflicts, distinct sessions and period', t => {
  const store=openUsageStore(fixture(t)); t.after(()=>store.close());
  assert.equal(store.record(event('a')).recorded,true);
  assert.equal(store.record(event('a')).recorded,false);
  assert.throws(()=>store.record({...event('a'),session:'b'}));
  store.record({...event('b'),session:'session-b'});
  assert.deepEqual({...store.rank().rows[0]},{collection:'demo',skill:'console',reads:2,sessions:2});
  assert.equal(store.rank({until:'2026-09-15T12:00:00.000Z'}).rows.length,0);
  assert.throws(()=>store.record({...event('c'),prompt:'do not store'}));
  assert.throws(()=>store.rank({limit:101}));
});
test('reject catalog and altered migrations without reset',t=>{
  const filename=fixture(t); let db=new DatabaseSync(filename); db.exec('CREATE TABLE metadata(k TEXT); INSERT INTO metadata VALUES (\'sentinel\')'); db.close();
  assert.throws(()=>openUsageStore(filename)); db=new DatabaseSync(filename); assert.equal(db.prepare('SELECT k FROM metadata').get().k,'sentinel'); db.close();
  fs.unlinkSync(filename); const store=openUsageStore(filename); store.close(); db=new DatabaseSync(filename); db.exec("UPDATE usage_migrations SET checksum='altered'"); db.close(); assert.throws(()=>openUsageStore(filename));
});
test('stdio initialization and bounded tool errors',t=>{
  const db=fixture(t); const messages=[{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}}},{jsonrpc:'2.0',method:'notifications/initialized'},{jsonrpc:'2.0',id:2,method:'tools/list'},{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'skill_read_record',arguments:event('a')}},{jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'skill_read_rankings'}},{jsonrpc:'2.0',id:5,method:'tools/call',params:{name:'skill_read_record',arguments:{prompt:'private-sentinel'}}}];
  const result=spawnSync(process.execPath,[server,'--db',db],{input:messages.map(x=>JSON.stringify(x)).join('\n')+'\n',encoding:'utf8'}); assert.equal(result.status,0,result.stderr);
  const rows=result.stdout.trim().split('\n').map(JSON.parse); assert.equal(rows.length,5); assert.equal(rows[1].result.tools.length,2); assert.equal(rows[3].result.structuredContent.rows[0].reads,1); assert.equal(rows[4].result.isError,true); assert.ok(!result.stdout.includes('private-sentinel'));
});
test('independent processes preserve concurrent event inserts',async t=>{
  const db=fixture(t); const initialize={jsonrpc:'2.0',id:1,method:'initialize'};
  await Promise.all(Array.from({length:6},(_,i)=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[server,'--db',db],{stdio:['pipe','ignore','pipe']}); let errors=''; child.stderr.on('data',x=>errors+=x); child.on('error',reject); child.on('exit',code=>code===0?resolve():reject(new Error(errors)));
    child.stdin.end([initialize,{jsonrpc:'2.0',method:'notifications/initialized'},{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'skill_read_record',arguments:event(`event-${i}`)}}].map(JSON.stringify).join('\n')+'\n');
  })));
  const store=openUsageStore(db); assert.equal(store.rank().rows[0].reads,6); store.close();
});
