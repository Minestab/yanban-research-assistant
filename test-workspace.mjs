import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mergeEntries,createWorkspace} from './dist/workspace-store.mjs';
import {translateSelection} from './dist/research.mjs';
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v))};};
test('independent device edits merge while conflicting notebook versions are retained',()=>{
 const base={'note:p':{text:'base'},'folder:f':{name:'old'}};
 const local={...base,'note:p':{text:'local'}};
 const remote={...base,'folder:f':{name:'new'}};
 assert.deepEqual(mergeEntries(base,local,remote),{merged:{'note:p':{text:'local'},'folder:f':{name:'new'}},conflicts:[]});
 remote['note:p']={text:'remote'};
 const conflict=mergeEntries(base,local,remote);
 assert.deepEqual(conflict.conflicts,[{key:'note:p',local:{text:'local'},remote:{text:'remote'}}]);
 assert.equal(mergeEntries(base,local,remote,'remote').merged['note:p'].text,'remote');
 assert.equal(mergeEntries(base,local,remote,'local').merged['folder:f'].name,'new');
});
test('deleted folder remains deleted during a concurrent independent note edit',()=>{
 const base={'folder:f':{name:'old'}};
 assert.equal(mergeEntries(base,{'folder:f':{name:'old',deleted:true}},{...base,'note:p':{text:'new'}}).merged['folder:f'].deleted,true);
});
test('account stores and guest data are isolated and restored after refresh',()=>{
 const s=storage(),a=createWorkspace(s,'a'),b=createWorkspace(s,'b'),guest=createWorkspace(s);
 a.set('note:p',{text:'A'});b.set('note:p',{text:'B'});guest.set('note:p',{text:'guest'});
 assert.equal(createWorkspace(s,'a').get('note:p').text,'A');assert.equal(b.get('note:p').text,'B');assert.equal(guest.get('note:p').text,'guest');
});
test('failed local save never updates the in-memory document',()=>{
 const s=storage(),w=createWorkspace(s);w.set('note:p',{text:'original'});
 s.setItem=()=>{throw Error('quota');};assert.throws(()=>w.set('note:p',{text:'lost'}),/quota/);assert.equal(w.get('note:p').text,'original');
});
test('stale tab cannot overwrite another tab notebook or folder',()=>{
 const s=storage(),a=createWorkspace(s),b=createWorkspace(s);a.set('note:p',{text:'new'});
 assert.throws(()=>b.set('folder:f',{name:'old view'}),/另一标签页/);
 assert.throws(()=>b.replace({}),/另一标签页/);assert.equal(createWorkspace(s).get('note:p').text,'new');
});
const doc={paragraphs:[{id:'p1',page:1,text:'Before the selected passage. After.'},{id:'p2',page:1,text:'Next paragraph with results.'}]};
test('selection translation sends only the chosen substring',async()=>{
 const calls=[];const result=await translateSelection(doc,{text:'selected passage.',paragraph_ids:['p1']},async m=>{calls.push(JSON.parse(m[1].content).source_text);return {message:{content:'{"translation":"选中的语段。"}'},model:'fixture'};});
 assert.deepEqual(calls,['selected passage.']);assert.equal(result.source_text,'selected passage.');assert.equal(result.selection,true);
});
test('selection spanning paragraph boundary is validated without translating surrounding text',async()=>{
 let sent='';await translateSelection(doc,{text:'After.\nNext paragraph',paragraph_ids:['p1','p2']},async m=>{sent+=JSON.parse(m[1].content).source_text;return {message:{content:'{"translation":"结束。下一段"}'}};});assert.equal(sent,'After.\nNext paragraph');
});
test('fabricated or oversized selection fails before model call',async()=>{
 const fail=()=>assert.fail('model must not be called');
 await assert.rejects(()=>translateSelection(doc,{text:'fabricated evidence',paragraph_ids:['p1']},fail));
 await assert.rejects(()=>translateSelection(doc,{text:'Before',paragraph_ids:['p99']},fail));
 await assert.rejects(()=>translateSelection(doc,{text:'x'.repeat(12001),paragraph_ids:['p1']},fail));
});
