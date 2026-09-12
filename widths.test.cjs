const test=require('node:test'),assert=require('node:assert/strict');
const {cells,tables,setWidths}=require('./widths.cjs');
test('width writes preserve escaped pipes, inline markup and cells',()=>{const raw='| **A** \\| B | C <!-- width=400 --> |';const next=setWidths(raw,[160,240]);assert.equal(cells(next).length,2);assert.match(next,/\*\*A\*\* \\\| B/);assert.equal(next.match(/width=/g).length,2);assert.match(next,/width=240/);});
test('tables without edge pipes and fenced examples',()=>{assert.equal(cells('A | B').length,2);assert.equal(setWidths('A | B',[100,200]),'A <!-- width=100 --> | B <!-- width=200 --> ');assert.equal(tables('```\n| A | B |\n| - | - |\n```').length,0);});
