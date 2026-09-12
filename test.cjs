const test = require('node:test');
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
