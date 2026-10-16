import assert from 'node:assert/strict';
import {readingChunks,readingCard,cleanCitations,translate,answer,fields,cardIssues,cardLimits} from './dist/research.mjs';
const checks=[];const test=async(name,fn)=>{await fn();checks.push(name)};
const doc={page_count:10,paragraphs:[{id:'p1',page:1,text:'a'.repeat(16000)},{id:'p2',page:10,text:'tail experiment 42'}]};
const final=content=>({message:{role:'assistant',content},model:'protocol-fixture'});
await test('all extracted characters covered including end',()=>assert.equal(readingChunks(doc).flat().map(p=>p.text).join(''),doc.paragraphs.map(p=>p.text).join('')));
await test('full card synthesis includes late evidence and counts gaps',async()=>{
 const calls=[];const result=await readingCard(doc,async messages=>{calls.push(messages);const payload=JSON.parse(messages[1].content);const id=payload.part===1?'p1':'p2';if(payload.untrusted_section_notes)assert.ok(JSON.stringify(payload).includes('tail 42'));return final(JSON.stringify(Object.fromEntries(fields.map(f=>[f,'tail 42 ['+id+']']))));});
 assert.equal(result.coverage.read_chars,16018);assert.deepEqual(result.coverage.pages,[1,10]);assert.equal(result.coverage.missing_pages.length,8);assert.equal(result.citations[0].paragraph_id,'p2');assert.equal(calls.length,4);
});
await test('one chunk card is verified against its original source',async()=>{let calls=0;const result=await readingCard({page_count:1,paragraphs:[{id:'p1',page:1,text:'intro'}]},async()=>{calls++;return final(JSON.stringify(Object.fromEntries(fields.map(f=>[f,'fact [p1]']))));});assert.equal(calls,2);assert.equal(result.coverage.chunks,1);});
await test('failed chunk fails complete card',()=>assert.rejects(()=>readingCard(doc,async()=>final('{}'))));
await test('unread citation removed',()=>{const r=cleanCitations('yes [p1] fake [p9] mixed [p1,p9]',new Map([['p1',{page:1,text:'evidence'}]]));assert.equal(r.citations.length,1);assert.ok(!r.text.includes('p9'));});
await test('oversized input rejects rather than silently truncates',()=>assert.throws(()=>readingChunks({paragraphs:[{id:'p1',text:'x'.repeat(513000)}]})));
await test('translation keeps every source character and mapping',async()=>{let sent='';const source='b'.repeat(6500);const result=await translate({paragraphs:[{id:'p3',page:2,text:source}]},['p3'],async messages=>{sent+=JSON.parse(messages[1].content).source_text;return final('{"translation":"译文"}')});assert.equal(sent,source);assert.equal(result.translations[0].paragraph_id,'p3');assert.equal(result.translations[0].page,2);});
await test('foreign translation id rejected',()=>assert.rejects(()=>translate(doc,['other'],async()=>assert.fail('must not call model'))));
await test('answer retrieves evidence through real tool protocol',async()=>{
 let calls=0;const result=await answer({paragraphs:[{id:'p1',page:1,text:'Introduction'},{id:'p2',page:2,text:'late experiment 42'}]},'result?',[],[],async messages=>{
  if(calls++===0)return {message:{role:'assistant',content:'',tool_calls:[{id:'call1',type:'function',function:{name:'search_paper',arguments:'{"query":"experiment"}'}}]},model:'fixture'};
  if(calls===2){assert.equal(messages.at(-1).role,'tool');assert.ok(messages.at(-1).content.includes('late experiment'));}
  else assert.ok(JSON.parse(messages.at(-1).content).untrusted_draft);
  return final('**Result** 42 [p2]');
 });assert.equal(result.citations[0].paragraph_id,'p2');assert.equal(result.trace.length,3);
});
await test('section without evidence does not label cited whole card as citation-free',async()=>{
 const result=await readingCard(doc,async messages=>{const p=JSON.parse(messages[1].content);return final(JSON.stringify(Object.fromEntries(fields.map(f=>[f,p.part===2?'未在提供的原文中找到明确依据。':'supported [p1]']))));});
 assert.equal(result.citations.length,1);assert.ok(result.warnings.some(w=>w.startsWith('第 2 个阅读分段')));assert.ok(!result.warnings.some(w=>w.startsWith('本次回答没有')));
});
await test('long or uncited appendix facts trigger evidence-preserving rewrite',async()=>{
 let count=0;const small={page_count:15,paragraphs:[{id:'p151',page:15,text:'Appendix visualization'}]};
 const result=await readingCard(small,async messages=>{count++;if(count===1)return final(JSON.stringify(Object.fromEntries(fields.map(f=>[f,'appendix '.repeat(120)]))));assert.ok(messages.at(-1).content.includes('validation_errors')||messages.at(-1).content.includes('untrusted_draft'));return final(JSON.stringify(Object.fromEntries(fields.map(f=>[f,'Appendix observation [p151]']))));});
 assert.equal(count,3);assert.equal(result.citations[0].page,15);assert.ok(result.card.evidence.length<=cardLimits.evidence);
});
await test('persistent length violation rejects instead of saving partial card',async()=>{
 let count=0;await assert.rejects(()=>readingCard({page_count:1,paragraphs:[{id:'p1',page:1,text:'source'}]},async()=>{count++;return final(JSON.stringify(Object.fromEntries(fields.map(f=>[f,'x'.repeat(900)+' [p1]']))));}),/未通过/);assert.equal(count,3);
});
await test('uncited final fact line cannot hide behind earlier cited line',()=>{
 const card=Object.fromEntries(fields.map(f=>[f,'fact [p1]\nunsupported appendix fact']));assert.ok(cardIssues(card,new Map([['p1',{}]])).length);
});
await test('evidence reviewer receives draft and actual read sources and replaces wrong comparison',async()=>{
 let count=0;const result=await answer({paragraphs:[{id:'p1',page:9,text:'8 heads 25.8 BLEU; 16 heads 25.8; 32 heads 25.4.'}]},'compare',[],[],async messages=>{if(count++===0)return final('16 heads worse [p1]');const p=JSON.parse(messages.at(-1).content);assert.ok(p.untrusted_draft.includes('worse'));assert.ok(p.untrusted_source_text[0].text.includes('16 heads 25.8'));return final('16 heads ties with 8 heads [p1]');});assert.equal(count,2);assert.ok(!result.answer.includes('worse'));
});
console.log(JSON.stringify({passed:checks.length,checks}));
