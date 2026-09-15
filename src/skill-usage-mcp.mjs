import { openUsageStore } from './infrastructure/skill-usage-store.mjs';
import { pathToFileURL } from 'node:url';

const tools = [
  { name: 'skill_read_record', description: 'Record an explicitly observed read, never an inferred activation. Retry with the same event ID.', inputSchema: { type: 'object', properties: Object.fromEntries(['event_id','collection','skill','revision','session','occurred_at'].map(k => [k,{type:'string'}])), required:['event_id','collection','skill','revision','session','occurred_at'], additionalProperties:false }, annotations: { readOnlyHint:false, destructiveHint:false, idempotentHint:true, openWorldHint:false } },
  { name: 'skill_read_rankings', description: 'Rank observed reads and distinct opaque sessions over a half-open UTC period.', inputSchema: { type:'object', properties:{from:{type:'string'},until:{type:'string'},limit:{type:'integer',minimum:1,maximum:100}}, additionalProperties:false }, annotations:{readOnlyHint:true,openWorldHint:false} }
];
export function startServer(store, input = process.stdin, output = process.stdout) {
  let initialized = false, ready = false, buffer = '';
  const send = value => output.write(`${JSON.stringify(value)}\n`);
  function handle(line) {
    let request;
    try { request = JSON.parse(line); } catch { send({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}}); return; }
    if (!request || Array.isArray(request) || request.jsonrpc !== '2.0' || typeof request.method !== 'string' || (Object.hasOwn(request,'id') && !(typeof request.id === 'string' || Number.isSafeInteger(request.id)))) { send({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid request'}}); return; }
    if (!Object.hasOwn(request,'id')) { if (request.method === 'notifications/initialized' && initialized) ready = true; return; }
    let result;
    try {
      if (request.method === 'initialize') {
        if (initialized) throw new Error('Already initialized');
        initialized = true;
        result = {protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'skill-usage',version:'0.1.0'}};
      } else if (request.method === 'ping') result = {};
      else if (!ready) throw new Error('Initialize first');
      else if (request.method === 'tools/list') result = {tools};
      else if (request.method === 'tools/call') {
        const {name,arguments: args = {}} = request.params ?? {};
        try {
          const value = name === 'skill_read_record' ? store.record(args) : name === 'skill_read_rankings' ? store.rank(args) : (() => {throw new Error('Unknown tool');})();
          result = {content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value};
        } catch { result = {isError:true,content:[{type:'text',text:'Invalid tool input or unavailable storage; no evidence inferred.'}]}; }
      } else { send({jsonrpc:'2.0',id:request.id,error:{code:-32601,message:'Method not found'}}); return; }
      send({jsonrpc:'2.0',id:request.id,result});
    } catch { send({jsonrpc:'2.0',id:request.id,error:{code:-32602,message:'Invalid protocol state or parameters'}}); }
  }
  input.setEncoding('utf8');
  input.on('data', chunk => {
    buffer += chunk;
    while (buffer.includes('\n')) {
      const end = buffer.indexOf('\n'); const line = buffer.slice(0,end); buffer = buffer.slice(end+1);
      if (Buffer.byteLength(line) > 65536) { input.destroy(); store.close(); return; }
      handle(line);
    }
    if (Buffer.byteLength(buffer) > 65536) { input.destroy(); store.close(); }
  });
  input.on('end', () => store.close());
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 4 || process.argv[2] !== '--db') { console.error('Usage: node src/skill-usage-mcp.mjs --db /absolute/caller-owned/skill-usage.db'); process.exitCode = 1; }
  else { try { startServer(openUsageStore(process.argv[3])); } catch { console.error('Cannot open dedicated usage database; check canonical path and schema.'); process.exitCode=1; } }
}
