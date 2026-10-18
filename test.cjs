const test = require('node:test');
test('tree task syntax keeps hierarchy separate from checkbox markers', () => {
  const {hierarchy} = require('./model.cjs');
  for (const checked of [' ', 'x']) {
    const root = hierarchy(`- [${checked}] Root`);
    assert.equal(root.depth, 0); assert.equal(root.explicit, ''); assert.equal(root.prefix, '');
    const child = hierarchy(`> - [${checked}] Child`);
    assert.equal(child.depth, 1); assert.equal(child.prefix, '> '); assert.equal(child.label, `- [${checked}] Child`);
  }
});
test('standalone block IDs after a tree table do not become table rows', () => {
  const source = '<!-- tree-table -->\n| Q | A |\n| --- | --- |\n| # Group | |\n| Root | |\n| > Child | text |\n^tree-block';
  const table = parse(source)[0];
  assert.equal(table.rows.length, 3);
  assert.equal(table.valid, true);
  assert.equal(table.end, 6);
});
const assert = require('node:assert/strict');
const { parse, folded, visibility } = require('./model.cjs');
const { headerGroupChange } = require('./header-groups.cjs');
const { continuationContexts } = require('./cell-outline-lines.cjs');
const { fencedCell } = require('./cell-code-source.cjs');

test('complete fenced blocks decode along with following cell content', () => {
  assert.equal(fencedCell('```mermaid<br>classDiagram<br>Animal <|-- Duck<br>```'),
    '```mermaid\nclassDiagram\nAnimal <|-- Duck\n```');
  assert.equal(fencedCell('~~~js<br>const n = 1;<br>~~~'), '~~~js\nconst n = 1;\n~~~');
  assert.equal(fencedCell('```mermaid<br>graph LR<br>A-->B<br>```<br><br>- item<br>text'),
    '```mermaid\ngraph LR\nA-->B\n```\n\n- item\ntext');
  assert.equal(fencedCell('```js<br>one<br>```<br><br>'), '```js\none\n```\n\n');
  assert.equal(fencedCell('```mermaid<br>graph LR<br>A-->B<br>```\n\n- item'),
    '```mermaid\ngraph LR\nA-->B\n```\n\n- item');
  assert.equal(fencedCell('123<br><br>```component<br>use: example.md#A<br>```<br><br>123'),
    '123\n\n```component\nuse: example.md#A\n```\n\n123');
  for (const source of ['`inline`<br>text', '```js<br>missing close', '```js<br>x<br>``', 'before<br>```js<br>x']) {
    assert.equal(fencedCell(source), null);
  }
});

test('table parsing unescapes code pipes before fenced-cell rendering', () => {
  const source = '| Name | Diagram |\n| --- | --- |\n| Demo | ```mermaid<br>classDiagram<br>Animal <\\|-- Duck<br>``` |';
  const cell = parse(source, 'diagram.md', {includePlain: true})[0].rows[0].cells[1];
  assert.equal(fencedCell(cell), '```mermaid\nclassDiagram\nAnimal <|-- Duck\n```');
  assert.match(source, /<\\\|--/);
});

test('visible header groups preserve the physical header and widths', () => {
  const source = '| # Travel<br>Hotel <!-- width=173 --> | Room | # Gear<br>Phone | Charger |\n| --- | --- | --- | --- |\n| Root | - [ ] | | |';
  const table = parse(source, 'groups.md', { autoDetect: true })[0];
  assert.equal(table.tree, true);
  assert.equal(table.headerGroups[0].label, 'Travel');
  assert.equal(table.headerGroups[2].label, 'Gear');
  assert.equal(table.headerGroups[1], null);
  assert.equal(table.rows.length, 1);
  const edit = headerGroupChange(source, table, 0, 'Stay');
  const next = source.slice(0, edit.from) + edit.insert + source.slice(edit.to);
  assert.match(next, /# Stay<br>Hotel <!-- width=173 -->/);
  const clear = headerGroupChange(next, parse(next, 'groups.md', { autoDetect: true })[0], 0, '');
  const cleared = next.slice(0, clear.from) + clear.insert + next.slice(clear.to);
  assert.match(cleared, /\| Hotel <!-- width=173 --> \|/);
});
test('header group edits support multiple columns and preserve cell markup', () => {
  const source = '| # Stay<br>Hotel **name** <!-- width=173 --> | Room | # Gear<br>Phone <!-- width=240 --> |\n| --- | --- | --- |\n| Tokyo | A | B |';
  const table = parse(source, 'groups.md', { autoDetect: true })[0];
  assert.deepEqual(table.headerGroups.map(group => group?.label || null), ['Stay', null, 'Gear']);
  const edit = headerGroupChange(source, table, 2, 'Devices');
  const next = source.slice(0, edit.from) + edit.insert + source.slice(edit.to);
  assert.match(next, /# Devices<br>Phone <!-- width=240 -->/);
  assert.match(next, /# Stay<br>Hotel \*\*name\*\* <!-- width=173 -->/);
});
test('clearing the only header group returns a plain field without changing width metadata', () => {
  const source = '| # A<br>Name <!-- width=301 --> | Other |\n| --- | --- |\n| Root | Value |';
  const table = parse(source, 'groups.md', { autoDetect: true })[0];
  const edit = headerGroupChange(source, table, 0, '');
  const next = source.slice(0, edit.from) + edit.insert + source.slice(edit.to);
  assert.equal(next.split('\n')[0], '| Name <!-- width=301 --> | Other |');
  assert.equal(parse(next, 'groups.md', { autoDetect: true, includePlain: true })[0].headerGroups.some(Boolean), false);
});
test('plain tables and fenced examples are not treated as header groups', () => {
  const plain = parse('| Name | Value |\n| --- | --- |\n| A | B |', 'plain.md', { autoDetect: true, includePlain: true })[0];
  assert.equal(plain.tree, false);
  const fenced = parse('```md\n| # Fake<br>Field |\n| --- |\n```', 'fenced.md', { autoDetect: true, includePlain: true });
  assert.equal(fenced.length, 0);
});
test('groups contain root objects, stop at next group and retain nested folds', () => {
  const source = '<!-- tree-table -->\n| Q | A |\n| --- | --- |\n' + ['Before', '# Strategy', '- Root', '> Child', 'Other', '#- Archive', 'Root', '> Child', '# Empty'].map(s => `| ${s} | |`).join('\n');
  const table = parse(source)[0];
  assert.equal(table.valid, true);
  assert.deepEqual(visibility(table.rows, {}), [false,false,false,true,false,false,true,true,false]);
  const group = table.rows[1];
  const states = { [group.key]: { explicit: '', closed: true } };
  assert.deepEqual(visibility(table.rows, states), [false,false,true,true,true,false,true,true,false]);
  states[group.key].closed = false;
  assert.equal(visibility(table.rows, states)[3], true);
  assert.equal(table.rows[8].hasChildren, false);
  assert.notEqual(table.rows[2].identity, table.rows[6].identity);
  assert.equal(group.markerOffset, 1);
  assert.equal(parse(source.replace('- Root', '> Root'))[0].valid, false);
});
test('top-level groups remain foldable when followed by nested groups', () => {
  const source = '<!-- tree-table -->\n| Q | A |\n| --- | --- |\n' + ['# 一级', '## 二级', '记录', '# 另一个一级', '记录'].map(s => `| ${s} | |`).join('\n');
  const table = parse(source)[0];
  assert.equal(table.rows[0].hasChildren, true);
  assert.equal(table.rows[1].hasChildren, true);
  assert.deepEqual(visibility(table.rows, {}), [false, false, false, false, false]);
  assert.deepEqual(visibility(table.rows, { [table.rows[0].key]: { explicit: '', closed: true } }), [false, true, true, false, false]);
  assert.deepEqual(visibility(table.rows, { [table.rows[1].key]: { explicit: '', closed: true } }), [false, false, true, false, false]);
});
const fixture = '<!-- tree-table column="Q" id="test" -->\n\n| Q | A |\n| --- | --- |\n| Root | text |\n| >- Child | [[Note\\|Alias]] |\n| >> Leaf | a\\|b |\n| Other | text |';

test('indented continuation lines align to their current list item and plain text stays independent', () => {
  const contexts = continuationContexts([
    '- 一级分组',
    '  - 二级元素',
    '    描述1',
    '    描述第二行',
    '  - 同层项目',
    '    同层续行',
    '- 下一个一级项',
    '  一级续行',
    '未缩进的普通文本',
    '  不能继承旧节点'
  ]);
  assert.deepEqual(contexts, [null, null, { depth: 2, skip: 4 }, { depth: 2, skip: 4 }, null, { depth: 2, skip: 4 }, null, { depth: 0, skip: 2 }, null, null]);
});

test('column accepts zero-based numeric syntax with or without quotes, id is optional', () => {
  for (const marker of ['<!-- tree-table column=0 -->', '<!-- tree-table column="0" -->', '<!-- tree-table -->']) {
    const table = parse(fixture.replace('<!-- tree-table column="Q" id="test" -->', marker), 'test.md')[0];
    assert.equal(table.col, 0);
    assert.equal(table.valid, true);
  }
});

test('hierarchy, explicit folding, escaped pipes and source mapping', () => {
  const table = parse(fixture, 'test.md')[0];
  assert.equal(table.valid, true);
  assert.equal(table.rows[1].cells[1], '[[Note|Alias]]');
  assert.equal(table.rows[2].cells[1], 'a|b');
  assert.deepEqual(table.rows.map(r => r.depth), [0, 1, 2, 0]);
  assert.deepEqual(visibility(table.rows, {}), [false, false, true, false]);
  assert.equal(table.rows[1].line, 5);
  assert.equal(table.rows[1].ch, 2);
});
test('automatic state survives text outside table and explicit change overrides memory', () => {
  const row = parse(fixture, 'test.md')[0].rows[1];
  const states = { [row.key]: { explicit: '-', closed: false } };
  assert.equal(folded(row, states), false);
  assert.equal(parse('# Heading\n\n' + fixture, 'test.md')[0].rows[1].key, row.key);
  assert.equal(folded({ ...row, explicit: '+' }, { [row.key]: { explicit: '-', closed: true } }), false);
});

test('auto-detects a tree when the first root row is plain and a later row is indented', () => {
  const source = '| Q | A |\n| --- | --- |\n| Root | |\n| > Child | |';
  const table = parse(source, 'later-child.md', { autoDetect: true })[0];
  assert.equal(table.tree, true);
  assert.equal(table.valid, true);
  assert.deepEqual(table.rows.map(row => row.depth), [0, 1]);
});
test('automatic state survives edits to root objects and group contents', () => {
  const source = '<!-- tree-table -->\n| Q | A |\n| --- | --- |\n| # Strategy | |\n| Root | before |\n| #- Archive | |\n| Old | |';
  const before = parse(source, 'test.md')[0];
  const after = parse(source.replace('Root', 'Root 123').replace('before', 'after'), 'test.md')[0];
  assert.equal(after.identity, before.identity);
  assert.equal(after.rows.find(r => r.group && r.label === 'Archive').key, before.rows.find(r => r.group && r.label === 'Archive').key);
});
test('unmarked, fenced and malformed hierarchies are not enhanced', () => {
  assert.equal(parse(fixture.replace(/<!--.*-->/, '')).length, 0);
  assert.equal(parse('```md\n' + fixture + '\n```').length, 0);
  assert.equal(parse(fixture.replace('>- Child', '>>>- Child'))[0].valid, false);
});
test('duplicate row paths use occurrence keys and duplicate table ids fail open', () => {
  const table = parse(fixture.replace('| Other | text |', '| > Child | duplicate |'))[0];
  assert.notEqual(table.rows[1].key, table.rows[3].key);
  assert.equal(table.rows[3].occurrence, 1);
  assert.equal(parse(fixture + '\n\n' + fixture).every(t => !t.valid), true);
});
test('bounded 200 row table parses without losing source rows', () => {
  const source = '<!-- tree-table -->\n| Q | A |\n| --- | --- |\n' + Array.from({ length: 200 }, (_, i) => `| ${i ? '> ' : ''}Row ${i} | Value |`).join('\n');
  const table = parse(source)[0];
  assert.equal(table.rows.length, 200);
  assert.equal(table.valid, true);
});

test('height metadata preserves legacy identity and does not leak across prose or fences', () => {
  for (const meta of ['<!-- height:1 -->','<!-- height: 1 -->','<!-- treeTable height: 1 -->']) {
    const source=fixture.replace('\n\n| Q', '\n'+meta+'\n\n| Q');
    const table=parse(source,'test.md')[0];
    assert.equal(table.singleLine,true);assert.equal(table.identity,'test');assert.equal(table.col,0);
    assert.equal(parse(source.replace(meta,meta+'\nprose'),'test.md').length,0);
  }
  const auto='<!-- height: 1 -->\n\n| Q | A |\n| --- | --- |\n| # Group | |\n| Item | one<br>two |';
  assert.equal(parse(auto,'a.md',{autoDetect:true})[0].singleLine,true);
  assert.equal(parse('```\n'+auto+'\n```','a.md',{autoDetect:true}).length,0);
});
test('height toggles edit only the comment and retain table, yaml and code bytes', () => {
  const {heightChange}=require('./row-height.cjs');
  const source='---\na: b\n---\n\n'+fixture+'\n^id\n\n```\n<!-- height: 1 -->\n```';
  const apply=(s,edits)=>edits.sort((a,b)=>b.from-a.from).reduce((s,e)=>s.slice(0,e.from)+e.insert+s.slice(e.to??e.from),s);
  const start=parse(source)[0].start;
  const enabled=apply(source,heightChange(source,start,true));
  assert.equal(parse(enabled)[0].singleLine,true);
  assert.ok(enabled.includes('<!-- treeTable height: 1 -->\n\n'));
  assert.deepEqual(heightChange(enabled,parse(enabled)[0].start,true),[]);
  const off=apply(enabled,heightChange(enabled,parse(enabled)[0].start,false));
  assert.equal(parse(off)[0].singleLine,false);
  assert.ok(off.includes(fixture.slice(fixture.indexOf('| Q'))));
});

test('repeated height toggles preserve preexisting blank separators exactly',()=>{
  const {heightChange}=require('./row-height.cjs');
  const table='| Q | A |\n| --- | --- |\n| # Group | |\n| Item | text |';
  const apply=(s,edits)=>edits.sort((a,b)=>b.from-a.from).reduce((s,e)=>s.slice(0,e.from)+e.insert+s.slice(e.to??e.from),s);
  for(const prefix of ['# Heading\n\n','Paragraph\n\n','Paragraph\n\n\n','<!-- tree-table -->\n\n']){
    const original=prefix+table;let s=original;
    for(let i=0;i<3;i++){
      s=apply(s,heightChange(s,s.split('\n').findIndex(l=>l.startsWith('|')),true));
      s=apply(s,heightChange(s,s.split('\n').findIndex(l=>l.startsWith('|')),false));
      assert.equal(s,original);
    }
  }
});

test('row height levels update only metadata and work for plain and tree tables',()=>{
  const {heightChange}=require('./row-height.cjs');
  const table='| Name | Notes |\n| --- | --- |\n| A | first<br>second |';
  const source='# Heading\n\n'+table+'\n\n```\n<!-- treeTable height: 6 -->\n```';
  const apply=(s,edits)=>edits.sort((a,b)=>b.from-a.from).reduce((s,e)=>s.slice(0,e.from)+e.insert+s.slice(e.to??e.from),s);
  let current=source;
  for(const level of [1,2,4,6,0]){
    const start=parse(current,'a.md',{includePlain:true})[0].start;
    current=apply(current,heightChange(current,start,level));
    const model=parse(current,'a.md',{includePlain:true})[0];
    assert.equal(model.rowHeight,level);
    assert.equal(model.singleLine,level===1);
    assert.ok(current.includes(table));
    assert.ok(current.includes('```\n<!-- treeTable height: 6 -->\n```'));
  }
  assert.equal(current,source);
});

test('plain tables opt into presentation without acquiring tree semantics or changing tree keys',()=>{
  const plain='| Name | Notes |\n| --- | --- |\n| normal | one<br>two |\n| > literal | text |';
  const tree='<!-- tree-table -->\n\n| Q | A |\n| --- | --- |\n| Root | |\n| > Child | |';
  const source=plain+'\n\n'+tree;
  const legacy=parse(source,'a.md');
  const all=parse(source,'a.md',{includePlain:true});
  assert.equal(all.length,2);assert.equal(all[0].tree,false);
  assert.equal(all[0].rows[1].cells[0],'> literal');
  assert.equal(all[0].rows[1].depth,undefined);
  assert.equal(all[1].identity,legacy[0].identity);
  assert.deepEqual(all[1].rows.map(r=>r.key),legacy[0].rows.map(r=>r.key));
  const compact=parse('<!-- treeTable height: 1 -->\n\n'+plain,'a.md',{includePlain:true});
  assert.equal(compact[0].singleLine,true);
  assert.equal(parse('```md\n'+plain+'\n```','a.md',{includePlain:true}).length,0);
});
