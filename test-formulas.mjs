import assert from 'node:assert/strict';
import {test} from 'node:test';
import {equationSegments,protectEquations} from './dist/pdf-equations.mjs';
import {paragraphRegions} from './dist/pdf-fragments.mjs';
import {translate} from './dist/research.mjs';
const raw='we set\nL\n′\n1 = L 1 / 2, C\n′\n1 = 2 C 1\n(1)\nThe odd-mode input admittance is';
test('damaged equation is separated from surrounding prose without inventing symbols',()=>{
 const segments=equationSegments(raw);assert.equal(segments.length,1);
 assert.equal(protectEquations(raw,'p15').text,'we set\n⟦PDF:p15:0⟧\nThe odd-mode input admittance is');
 assert.equal(raw.slice(segments[0].start,segments[0].end),segments[0].text);
});
test('ordinary prose, numeric results and existing LaTeX are not removed',()=>{
 for(const text of ['The measured insertion loss is 2.61 dB.','The formula is $f=\\frac{1}{2\\pi\\sqrt{LC}}$.','3.14'])assert.deepEqual(equationSegments(text),[]);
});
test('translation keeps an exact original equation reference and rejects lost markers',async()=>{
 const doc={paragraphs:[{id:'p15',page:2,text:raw}]};
 const translated=await translate(doc,['p15'],async messages=>{assert.ok(JSON.parse(messages[1].content).source_text.includes('⟦PDF:p15:0⟧'));return {message:{content:JSON.stringify({translation:'我们设\n⟦PDF:p15:0⟧\n奇模输入导纳为'})}};});
 assert.ok(translated.translations[0].text.includes('⟦PDF:p15:0⟧'));
 await assert.rejects(()=>translate(doc,['p15'],async()=>({message:{content:'{"translation":"错误地删除公式"}'}})),/未保留原公式/);
});
test('repeated PDF words retain paragraph identity and licensing footer is not part of the equation crop',()=>{
 const items=[{str:'A'},{str:'='},{str:'A'},{str:'B'},{str:'Authorized licensed use limited to: TEST'}];
 const result=paragraphRegions(items,[{id:'p1',text:'A = A'},{id:'p2',text:'B\nAuthorized licensed use limited to: TEST'}]);
 assert.deepEqual(result.map(r=>r.items),[[0,1,2],[3]]);
});
