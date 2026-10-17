import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createSelectionTranslator} from './dist/selection-translator.mjs';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const input=text=>({documentId:'paper',epoch:1,ids:['p1'],text,model:'test'});
test('adjusting a selection during debounce calls the model only for the final text',async()=>{
 const calls=[];const t=createSelectionTranslator({delay:10,translate:async i=>{calls.push(i.text);return i.text;}});
 t.select(input('first'));t.select(input('second'));t.select(input('second'));await wait(25);
 assert.deepEqual(calls,['second']);assert.equal(t.snapshot().text,'second');
});
test('superseded responses and failures cannot replace the new selection result',async()=>{
 let old,signal;const t=createSelectionTranslator({translate:(i,s)=>i.text==='old'?new Promise((resolve,reject)=>{old={resolve,reject};signal=s;}):Promise.resolve('new translation')});
 t.select(input('old'),{immediate:true});t.select(input('new'),{immediate:true});await wait(0);old.reject(Error('late error'));await wait(0);
 assert.equal(signal.aborted,true);assert.equal(t.snapshot().text,'new translation');assert.equal(t.snapshot().error,'');
});
test('clearing selection aborts work and ignores even a successful late response',async()=>{
 let resolve;const t=createSelectionTranslator({translate:()=>new Promise(r=>resolve=r)});t.select(input('old'),{immediate:true});t.cancel();resolve('late');await wait(0);assert.equal(t.snapshot().status,'idle');
});
test('identical selections reuse results but document and model changes do not',async()=>{
 let calls=0;const t=createSelectionTranslator({translate:async()=>String(++calls)});const i=input('same');t.select(i,{immediate:true});await wait(0);t.cancel();t.select(i,{immediate:true});assert.equal(calls,1);
 t.select({...i,documentId:'other'},{immediate:true});await wait(0);t.select({...i,model:'other'},{immediate:true});await wait(0);assert.equal(calls,3);
});
test('failed requests show an error and manual retry can replace a cached result',async()=>{
 let calls=0;const t=createSelectionTranslator({translate:async()=>{if(++calls===1)throw Error('offline');return String(calls);}});const i=input('text');t.select(i,{immediate:true});await wait(0);assert.equal(t.snapshot().error,'offline');t.select(i,{force:true,immediate:true});await wait(0);assert.equal(t.snapshot().text,'2');t.select(i,{force:true,immediate:true});await wait(0);assert.equal(t.snapshot().text,'3');
});
