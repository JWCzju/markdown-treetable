const MarkdownIt = require('markdown-it');
const parser = new MarkdownIt();
const WIDTH = /<!--\s*width\s*=\s*(\d+)\s*-->/;
const clamp = value => Math.max(60, Math.min(2400, Math.round(value)));
function cells(line) {
  const pipes=[];
  for(let i=0;i<line.length;i++) if(line[i]==='|') {let n=0;for(let j=i-1;j>=0&&line[j]==='\\';j--)n++;if(n%2===0)pipes.push(i);}
  const edges=[...(line.trimStart().startsWith('|')?[]:[-1]),...pipes,...(line.trimEnd().endsWith('|')?[]:[line.length])];
  return edges.slice(0,-1).map((p,i)=>({from:p+1,to:edges[i+1],text:line.slice(p+1,edges[i+1])}));
}
function tables(source) {
  const lines=source.split('\n');
  return parser.parse(source,{}).filter(t=>t.type==='table_open' && t.level===0).map(t=>({line:t.map[0],end:t.map[1],raw:lines[t.map[0]],cells:cells(lines[t.map[0]])}));
}
function setWidths(line,widths) {
  let result=line;
  const list=cells(line);
  for(let i=list.length-1;i>=0;i--) {
    const c=list[i];const value=clamp(widths[i]);
    const text=WIDTH.test(c.text)?c.text.replace(WIDTH,`<!-- width=${value} -->`):c.text.trimEnd()+` <!-- width=${value} --> `;
    result=result.slice(0,c.from)+text+result.slice(c.to);
  }
  return result;
}
module.exports={WIDTH,clamp,cells,tables,setWidths};
