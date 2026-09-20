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
const fixture = '<!-- tree-table column="Q" id="test" -->\n\n| Q | A |\n| --- | --- |\n| Root | text |\n| >- Child | [[Note\\|Alias]] |\n| >> Leaf | a\\|b |\n| Other | text |';

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
  for (const meta of ['<!-- height:1 -->','<!-- height: 1 -->']) {
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
  assert.ok(enabled.includes('<!-- height: 1 -->\n\n'));
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
