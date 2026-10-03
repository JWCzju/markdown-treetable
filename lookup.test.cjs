const {test}=require('node:test');const a=require('node:assert/strict');
const {lookupRule,sourceLinks,rowLookup}=require('./lookup-model.cjs');
const {parse}=require('./model.cjs');
test('short, explicit and full rules agree; quoted properties preserve spaces',()=>{
 for(const text of ['@模型','@模型 from=0','from=0 property=模型'])a.deepEqual(lookupRule(`模型 <!-- lookup ${text} -->`),{from:0,property:'模型'});
 a.deepEqual(lookupRule('<!-- lookup @"判别 模型" from=1 -->'),{from:1,property:'判别 模型'});
 for(const text of ['@模型 from=-1','@模型 from=1 from=2','@','@模型 extra'])a.ok(lookupRule(`<!-- lookup ${text} -->`).error);
});
test('manual overrides and group rows skip; ambiguity never silently selects',()=>{
 const rule={from:0,property:'模型'};
 a.equal(rowLookup({cells:['[[A]]','手写']},1,rule,2),null);
 a.equal(rowLookup({group:true,cells:['# [[A]]','']},1,rule,2),null);
 a.equal(rowLookup({cells:['普通文本','']},1,rule,2),null);
 a.ok(rowLookup({cells:['[[A]] [[B]]','']},1,rule,2).error);
 a.deepEqual(rowLookup({cells:['> [[A|别名]]','']},1,rule,2),{target:'A',property:'模型'});
});
test('code and embeds are not source links',()=>{
 a.deepEqual(sourceLinks('`[[示例]]` ![[嵌入]] [[真实#标题|别名]]'),['真实']);
});
test('ordinary tables retain source path and lookup header',()=>{
 const t=parse('| 来源 | 模型 <!-- lookup @模型 --> |\n| --- | --- |\n| [[A]] | |','dir/test.md',{includePlain:true})[0];
 a.equal(t.path,'dir/test.md');a.equal(t.tree,false);a.equal(lookupRule(t.headers[1]).property,'模型');
});
