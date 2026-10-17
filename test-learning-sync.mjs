import assert from 'node:assert/strict';
import {test} from 'node:test';
import {initCloud} from './dist/cloud.mjs';
test('cloud sync uploads legacy learning metadata and downloads another device lesson, including trash',async()=>{
 const old={window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage,CustomEvent:globalThis.CustomEvent};
 const localLearning={id:'learning-v1:a',value:{answers:{q:'local'}}};const remoteLearning={plan:{steps:[]},lessons:{basics:{why:'remote'}}};
 let saved,flushed=false;const writes=[],storage=new Map(),workspace={value:{},all(){return this.value;},ensureFresh(){},replace(v){this.value=v;}};
 const client={auth:{getSession:async()=>({data:{session:{user:{id:'u',email:'test'}}}}),getUser:async()=>({data:{user:{id:'u'}}}),onAuthStateChange(){}},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{revision:1,entries:{'learning:b':remoteLearning,'paper-trash:b':{deleted:true}}}})})})}),rpc:async(name,input)=>{saved=input.new_entries;return {data:true};}};
 try{
  globalThis.window={YANBAN_CLOUD_CONFIG:{url:'test',publishableKey:'public'},supabase:{createClient:()=>client},YanbanLearning:{flush:async()=>{flushed=true;}},dispatchEvent(){}};
  globalThis.document={body:{children:[],classList:{add(){},remove(){}}}};globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};globalThis.CustomEvent=class {constructor(name,args){this.type=name;this.detail=args?.detail;}};
  const repo={all:async()=>[],learningAll:async()=>[localLearning],readSyncBase:async()=>({}),saveSyncBase:async()=>{},putLearning:async(id,value)=>writes.push({id,value})};
  const cloud=await initCloud(()=>{});await cloud.sync(repo,workspace);assert(flushed);assert.deepEqual(saved['learning:a'],localLearning.value);assert.deepEqual(writes.find(w=>w.id==='b').value,remoteLearning);assert.equal(workspace.value['paper-trash:b'].deleted,true);assert.equal(workspace.value['learning:b'],undefined);
 }finally{for(const [key,value] of Object.entries(old)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
