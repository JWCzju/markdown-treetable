const MarkdownIt = require('markdown-it');
const md = new MarkdownIt();
function lookupRule(header) {
  const matches = [...header.matchAll(/<!--\s*lookup\b([\s\S]*?)-->/g)];
  if (!matches.length) return null;
  if (matches.length !== 1) return {error:'一列只能定义一个 lookup'};
  let text=matches[0][1].trim(), from=0, property=null, hasFrom=false;
  const str='("(?:\\\\.|[^"\\\\])*"|[^\\s]+)';
  while(text) {
    let m=text.match(new RegExp('^(?:@|property=)'+str+'(?:\\s+|$)'));
    if(m) {
      if(property!==null)return {error:'属性重复定义'};
      try { property=m[1].startsWith('"')?JSON.parse(m[1]):m[1]; } catch {return {error:'属性名引号无效'};}
    } else {
      m=text.match(/^from=(\d+)(?:\s+|$)/);
      if(!m||hasFrom)return {error:'lookup 格式无效'};
      from=Number(m[1]);hasFrom=true;
    }
    text=text.slice(m[0].length);
  }
  return property?.trim()?{from,property}:{error:'缺少属性名'};
}
function sourceLinks(source) {
  // Inline-code examples and fenced/code tokens are not lookup links.
  const tokens=md.parseInline(source,{})[0]?.children||[];
  const links=[];
  for(const token of tokens)if(token.type==='text') {
    for(const m of token.content.matchAll(/(?<!!)\[\[([^\[\]\n]+)\]\]/g)) {
      const target=m[1].split('|')[0].split('#')[0].trim();
      if(target)links.push(target);
    }
  }
  return links;
}
function rowLookup(row, column, rule, count) {
  if(row.group || row.cells[column]?.trim())return null;
  if(rule.error)return {error:rule.error};
  if(rule.from>=count || rule.from===column)return {error:'来源列不存在或指向自身'};
  const links=sourceLinks(row.cells[rule.from]||'');
  if(!links.length)return null;
  if(links.length!==1)return {error:'来源列有多个链接，请保留一个'};
  return {target:links[0],property:rule.property};
}
module.exports={lookupRule,sourceLinks,rowLookup};
