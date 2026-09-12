const test = require('node:test');
const assert = require('node:assert/strict');
const {FoldMemory} = require('./fold-memory.cjs');
const source = '| 对象 | 分析 |\n| --- | --- |\n| # 归档 | - 父甲<br>  - 子甲<br>- 父乙<br>  - 子乙 |\n| 一级 | 内容 |\n';
function setup() {const m=new FoldMemory(); for(const n of m.sync('a.md',source))m.set('a.md',source,n,true);return m;}
test('both tree and cell memory survive reload without modifying source',()=>{
 const m=setup(), saved=JSON.parse(JSON.stringify(m.data)), n=new FoldMemory(saved);
 assert.equal(n.sync('a.md',source).length,3);
 for(const x of n.sync('a.md',source))assert.equal(n.get('a.md',x),true);
 assert.ok(!JSON.stringify(saved).includes('父甲'));
});
test('editor insertion and native full-row replacement map source anchors',()=>{
 const m=setup(), after='前插\n'+source;
 m.update('a.md',source,after,[{from:0,to:0,insert:'前插\n'}]);
 for(const n of m.sync('a.md',after))assert.equal(m.get('a.md',n),true);
 const newer=after.replace('父甲','父甲改名');
 m.update('a.md',after,newer,[{from:0,to:after.length,insert:newer}]);
 for(const n of m.sync('a.md',newer))assert.equal(m.get('a.md',n),true);
});
test('inserting list sibling does not transfer its successor fold to the new node',()=>{
 const m=setup(), pos=source.indexOf('- 父乙'), insert='- 新父<br>  - 新子<br>';
 const after=source.slice(0,pos)+insert+source.slice(pos);
 m.update('a.md',source,after,[{from:pos,to:pos,insert}]);
 const nodes=m.sync('a.md',after).filter(n=>n.kind==='cell');
 assert.deepEqual(nodes.map(n=>m.get('a.md',n)),[true,false,true]);
});
test('same-line-count external edits invalidate and deleted anchors do not transfer',()=>{
 const m=setup();const changed=source.replace('父甲','换甲');m.sync('a.md',changed);
 assert.equal(m.data.files['a.md'],undefined);
 const x=setup(), from=source.indexOf('- 父甲'), to=source.indexOf('- 父乙');
 const after=source.slice(0,from)+source.slice(to);
 x.update('a.md',source,after,[{from,to,insert:''}]);
 assert.equal(x.data.files['a.md'].records.filter(n=>n.kind==='cell').length,1);
});
test('file and folder renames migrate closed records, delete cleans up',()=>{
 const m=setup();m.rename('a.md','folder/a.md');m.rename('folder','new');
 for(const n of m.sync('new/a.md',source))assert.equal(m.get('new/a.md',n),true);
 assert.equal(m.data.files['a.md'],undefined);m.remove('new');assert.equal(Object.keys(m.data.files).length,0);
});
test('table with escaped pipes and no edge pipes resolves cell positions',()=>{
 const s='对象 | 分析\n--- | ---\n名字 | - 父\\|甲<br>  - 子\n';
 const m=new FoldMemory(),nodes=m.sync('x',s);
 assert.equal(nodes.length,1);assert.equal(s.slice(nodes[0].pos,nodes[0].pos+3),'- 父');
});
test('native alignment of whole table preserves anchors',()=>{
 const m=setup(), after=source.replaceAll('| 对象 |','| 对象    |').replaceAll('| --- |','| ------- |').replaceAll('| # 归档 |','| # 归档   |');
 m.update('a.md',source,after,[{from:0,to:source.length,insert:after}]);
 for(const n of m.sync('a.md',after))assert.equal(m.get('a.md',n),true);
});
