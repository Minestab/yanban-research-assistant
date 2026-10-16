import assert from 'node:assert/strict';
import {readingChunks,readingCard,cleanCitations,translate,answer,fields} from './dist/research.mjs';
const checks=[];const test=async(name,fn)=>{await fn();checks.push(name)};
const doc={page_count:10,paragraphs:[{id:'p1',page:1,text:'a'.repeat(16000)},{id:'p2',page:10,text:'tail experiment 42'}]};
const final=content=>({message:{role:'assistant',content},model:'protocol-fixture'});
await test('all extracted characters covered including end',()=>assert.equal(readingChunks(doc).flat().map(p=>p.text).join(''),doc.paragraphs.map(p=>p.text).join('')));
await test('full card synthesis includes late evidence and counts gaps',async()=>{
 const calls=[];const result=await readingCard(doc,async messages=>{calls.push(messages);const payload=JSON.parse(messages[1].content);const id=payload.part===1?'p1':'p2';if(payload.untrusted_section_notes)assert.ok(JSON.stringify(payload).includes('tail 42'));return final(JSON.stringify(Object.fromEntries(fields.map(f=>[f,'tail 42 ['+id+']']))));});
 assert.equal(result.coverage.read_chars,16018);assert.deepEqual(result.coverage.pages,[1,10]);assert.equal(result.coverage.missing_pages.length,8);assert.equal(result.citations[0].paragraph_id,'p2');assert.equal(calls.length,3);
});
await test('one chunk direct card needs only one model request',async()=>{let calls=0;const result=await readingCard({page_count:1,paragraphs:[{id:'p1',page:1,text:'intro'}]},async()=>{calls++;return final(JSON.stringify(Object.fromEntries(fields.map(f=>[f,'fact [p1]']))));});assert.equal(calls,1);assert.equal(result.coverage.chunks,1);});
await test('failed chunk fails complete card',()=>assert.rejects(()=>readingCard(doc,async()=>final('{}'))));
await test('unread citation removed',()=>{const r=cleanCitations('yes [p1] fake [p9] mixed [p1,p9]',new Map([['p1',{page:1,text:'evidence'}]]));assert.equal(r.citations.length,1);assert.ok(!r.text.includes('p9'));});
await test('oversized input rejects rather than silently truncates',()=>assert.throws(()=>readingChunks({paragraphs:[{id:'p1',text:'x'.repeat(513000)}]})));
await test('translation keeps every source character and mapping',async()=>{let sent='';const source='b'.repeat(6500);const result=await translate({paragraphs:[{id:'p3',page:2,text:source}]},['p3'],async messages=>{sent+=JSON.parse(messages[1].content).source_text;return final('{"translation":"译文"}')});assert.equal(sent,source);assert.equal(result.translations[0].paragraph_id,'p3');assert.equal(result.translations[0].page,2);});
await test('foreign translation id rejected',()=>assert.rejects(()=>translate(doc,['other'],async()=>assert.fail('must not call model'))));
await test('answer retrieves evidence through real tool protocol',async()=>{
 let calls=0;const result=await answer({paragraphs:[{id:'p1',page:1,text:'Introduction'},{id:'p2',page:2,text:'late experiment 42'}]},'result?',[],[],async messages=>{
  if(calls++===0)return {message:{role:'assistant',content:'',tool_calls:[{id:'call1',type:'function',function:{name:'search_paper',arguments:'{"query":"experiment"}'}}]},model:'fixture'};
  assert.equal(messages.at(-1).role,'tool');assert.ok(messages.at(-1).content.includes('late experiment'));return final('**Result** 42 [p2]');
 });assert.equal(result.citations[0].paragraph_id,'p2');assert.equal(result.trace.length,2);
});
console.log(JSON.stringify({passed:checks.length,checks}));
