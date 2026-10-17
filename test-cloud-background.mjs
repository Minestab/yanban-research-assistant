import assert from 'node:assert/strict';
import {test} from 'node:test';
import {initCloud} from './dist/cloud.mjs';
import {createWorkspace,scopeKey} from './dist/workspace-store.mjs';
async function setup(fn){
 const saved=Object.fromEntries(['window','document','localStorage','CustomEvent'].map(k=>[k,globalThis[k]]));
 const map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 let row={revision:1,entries:{'note:a':{text:'old'}}},base=structuredClone(row.entries),rpcCalls=0,hook=null;
 const events=[],elements=[{inert:false}],learning=[];
 const client={auth:{getSession:async()=>({data:{session:{user:{id:'u'}}}}),getUser:async()=>({data:{user:{id:'u'}}}),onAuthStateChange(){}},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:structuredClone(row)})})})}),rpc:async(name,input)=>{rpcCalls++;row={revision:row.revision+1,entries:structuredClone(input.new_entries)};if(hook)await hook();return {data:true};}};
 try{
  globalThis.CustomEvent=class{constructor(type,args){this.type=type;this.detail=args?.detail;}};globalThis.localStorage=storage;
  globalThis.window={YANBAN_CLOUD_CONFIG:{url:'test',publishableKey:'public'},supabase:{createClient:()=>client},YanbanApp:{isBusy:()=>false},YanbanLearning:{flush:async()=>{}},dispatchEvent:e=>events.push(e.type)};
  globalThis.document={body:{children:elements,classList:{add(){},remove(){}}}};
  const ws=createWorkspace(storage,'u');ws.replace(base);
  const repo={all:async()=>[],learningAll:async()=>learning,putLearning:async()=>{},readSyncBase:async()=>base,saveSyncBase:async b=>{base=structuredClone(b);},saveConflictBackup:async()=>{}};
  const cloud=await initCloud(()=>{});
  await fn({cloud,ws,repo,events,elements,get row(){return row;},set row(v){row=v;},get base(){return base;},get calls(){return rpcCalls;},set hook(v){hook=v;}});
 }finally{for(const [k,v] of Object.entries(saved)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
}
test('unchanged background checks do not upload or redraw editors',()=>setup(async h=>{await h.cloud.sync(h.repo,h.ws,'',{background:true});assert.equal(h.calls,0);assert(!h.events.includes('yanban-sync-complete'));assert(h.elements.every(e=>!e.inert));}));
test('typing during RPC survives and the next pass does not conflict with our own upload',()=>setup(async h=>{h.ws.set('note:a',{text:'first'});h.hook=()=>{assert.equal(h.elements[0].inert,false);h.ws.set('note:a',{text:'new typing'});};const result=await h.cloud.sync(h.repo,h.ws,'',{background:true});assert(result.deferred);assert.equal(h.ws.get('note:a').text,'new typing');assert.equal(h.base['note:a'].text,'first');h.hook=null;await h.cloud.sync(h.repo,h.ws,'',{background:true});assert.equal(h.row.entries['note:a'].text,'new typing');assert.equal(h.cloud.pending,null);}));
test('remote changes to unrelated notes merge without generating an autosync loop',()=>setup(async h=>{h.ws.set('note:a',{text:'local'});h.row={revision:2,entries:{'note:a':{text:'old'},'note:b':{text:'remote'}}};h.events.length=0;await h.cloud.sync(h.repo,h.ws,'',{background:true});assert.equal(h.ws.get('note:b').text,'remote');assert.equal(h.ws.get('note:a').text,'local');assert(h.events.includes('yanban-sync-complete'));assert(!h.events.includes('yanban-workspace-change'));}));
test('a new edit to an incoming remote key becomes an explicit conflict instead of being overwritten',()=>setup(async h=>{h.ws.set('note:a',{text:'local'});h.row={revision:2,entries:{'note:a':{text:'old'},'note:b':{text:'remote'}}};h.hook=()=>h.ws.set('note:b',{text:'new concurrent local'});assert((await h.cloud.sync(h.repo,h.ws,'',{background:true})).deferred);h.hook=null;await assert.rejects(()=>h.cloud.sync(h.repo,h.ws,'',{background:true}),/同时修改/);assert.equal(h.ws.get('note:b').text,'new concurrent local');assert(h.cloud.pending);}));
test('an unflushed learning input prevents applying an incoming remote version',()=>setup(async h=>{h.ws.set('note:a',{text:'local'});h.row={revision:2,entries:{'note:a':{text:'old'},'note:b':{text:'remote'}}};window.YanbanAutoSync={isEditing:()=>false};h.hook=()=>{window.YanbanAutoSync.isEditing=()=>true;};assert((await h.cloud.sync(h.repo,h.ws,'',{background:true})).deferred);assert(!h.events.includes('yanban-sync-complete'));assert.equal(h.ws.get('note:b'),undefined);}));
