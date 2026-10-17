import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createPageTranslator} from './dist/page-translator.mjs';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('cached paragraphs are skipped and at most two requests run together',async()=>{
 let active=0,max=0;const called=[],saved=[],values=new Map([['p1','cached']]);
 const queue=createPageTranslator({translate:async p=>{called.push(p.id);max=Math.max(max,++active);await tick();active--;return '译文'+p.id;},save:async(id,text)=>saved.push([id,text])});
 await queue.start(['p1','p2','p3','p4'].map(id=>({id})),values);
 assert.equal(max,2);assert.deepEqual(called,['p2','p3','p4']);assert.equal(saved.length,3);assert.equal(queue.snapshot().status,'done');
 await queue.start(['p1','p2','p3','p4'].map(id=>({id})),values);assert.equal(called.length,3);
});
test('changing page aborts old requests and never saves late results into new page',async()=>{
 let resolveOld;const saved=[],oldValues=new Map(),newValues=new Map();
 const queue=createPageTranslator({concurrency:1,translate:(p,signal)=>p.id==='old'?new Promise(r=>{resolveOld=r;}):Promise.resolve('new result'),save:async(id,text)=>saved.push(id)});
 const old=queue.start([{id:'old'},{id:'never'}],oldValues);await tick();
 await queue.start([{id:'new'}],newValues);resolveOld('stale');await old;
 assert.deepEqual(saved,['new']);assert.equal(oldValues.size,0);assert.equal(newValues.get('new'),'new result');
});
test('failed paragraphs are visible and only failures are retried',async()=>{
 let fail=true;const calls=[],values=new Map();const queue=createPageTranslator({translate:async p=>{calls.push(p.id);if(fail&&p.id==='p2')throw Error('network');return p.id;},save:async()=>{}});
 await queue.start([{id:'p1'},{id:'p2'}],values);assert.equal(queue.snapshot().status,'error');assert.equal(queue.snapshot().errors.get('p2'),'network');
 fail=false;await queue.start([{id:'p1'},{id:'p2'}],values);assert.deepEqual(calls,['p1','p2','p2']);assert.equal(queue.snapshot().status,'done');
});
test('pausing stops queued requests and does not erase completed translations',async()=>{
 let pending;const values=new Map(),calls=[];const queue=createPageTranslator({concurrency:1,translate:async p=>{calls.push(p.id);if(p.id==='p2')await new Promise(r=>pending=r);return p.id;},save:async()=>{}});
 const work=queue.start([{id:'p1'},{id:'p2'},{id:'p3'}],values);await tick();queue.cancel();pending();await work;
 assert.deepEqual(calls,['p1','p2']);assert.equal(values.get('p1'),'p1');assert.equal(values.has('p2'),false);assert.equal(queue.snapshot().status,'paused');
});
