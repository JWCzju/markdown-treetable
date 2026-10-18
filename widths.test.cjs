const test=require('node:test'),assert=require('node:assert/strict');
const {cells,tables,setWidths}=require('./widths.cjs');
test('width writes preserve escaped pipes, inline markup and cells',()=>{const raw='| **A** \\| B | C <!-- width=400 --> |';const next=setWidths(raw,[160,240]);assert.equal(cells(next).length,2);assert.match(next,/\*\*A\*\* \\\| B/);assert.equal(next.match(/width=/g).length,2);assert.match(next,/width=240/);});
test('tables without edge pipes and fenced examples',()=>{assert.equal(cells('A | B').length,2);assert.equal(setWidths('A | B',[100,200]),'A <!-- width=100 --> | B <!-- width=200 --> ');assert.equal(tables('```\n| A | B |\n| - | - |\n```').length,0);});

test('dragging one column leaves other columns automatic or explicitly unchanged',()=>{const raw='| A | B <!-- width=800 --> | C |';const next=setWidths(raw,[250,null,null]);assert.equal(next,'| A <!-- width=250 --> | B <!-- width=800 --> | C |');assert.equal(cells(next)[2].text,' C ');});
test('complex TreeTable header keeps five columns through every width update',()=>{
  const raw='| <!-- width=100 --> | [html-blocks](https://github.com/JWCzju/html-blocks) <!-- width=221 --> | Excali <!-- width=125 --> | [advanced-tables-obsidian](https://github.com/tgrosinger/advanced-tables-obsidian) | **[obsidian-copilot](https://github.com/logancyang/obsidian-copilot)**<!-- width=256 --> |';
  for(const index of [0,1,2,3,4]){
    const widths=[null,null,null,null,null]; widths[index]=index*111+180;
    const next=setWidths(raw,widths);
    assert.equal(cells(next).length,5,`column ${index+1}`);
    assert.equal(next.split('|').length,7,`pipe boundary ${index+1}`);
    assert.match(next,new RegExp(`width=${widths[index]}`));
  }
});
test('complex multiline cells retain five columns after a header write-back',()=>{
  const row='| | *Why*<br>- 概述<br>*What*<br>- 功能 · 检查模式<br>- 支持作者 | - 概述<br>- 设置 | *What & Why*<br>- Demo<br>- 备注 | - 介绍卡片<br>- 支持项目<br>- 作者 |';
  assert.equal(cells(row).length,5);
  const header='| A | B | C | D | E |';
  assert.equal(cells(setWidths(header,[null,480,null,null,null])).length,5);
  assert.equal(cells(row).length,5);
});
