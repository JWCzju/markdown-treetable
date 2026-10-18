function item(text) { return /^([ \t]*)(?:[-+*]|\d+[.)]) /.exec(text); }
const depth = prefix => prefix.replace(/\t/g, '    ').length;
function subtreeEnd(doc, number) {
  const root = item(doc.line(number).text);
  if (!root) return number;
  let end = number;
  for (let n=number+1;n<=doc.lines;n++) {
    const text=doc.line(n).text;
    if (!text.trim()) break;
    const child=item(text);
    const indent=/^[ \t]*/.exec(text)[0];
    if (child ? depth(child[1])<=depth(root[1]) : depth(indent)<depth(root[1])+2) break;
    end=n;
  }
  return end;
}
function indentChanges(doc, selection, out) {
  const first=doc.lineAt(selection.from);
  if (!item(first.text)) return null;
  // A selection ending at the next line's start excludes that line.
  const last=doc.lineAt(selection.to>selection.from ? selection.to-1 : selection.to);
  let end=last.number;
  for(let n=first.number;n<=last.number;n++) end=Math.max(end,subtreeEnd(doc,n));
  const roots=[];
  for(let n=first.number;n<=end;) { roots.push(n); n=Math.max(n+1,subtreeEnd(doc,n)+1); }
  const changes=[];
  for(const root of roots) {
    const line=doc.line(root), match=/^( {1,2}|\t)/.exec(line.text);
    // An already top-level subtree must not have only its children outdented.
    if(out&&!match)continue;
    const until=Math.min(end,subtreeEnd(doc,root));
    for(let n=root;n<=until;n++) {
      const l=doc.line(n),remove=out?(/^( {1,2}|\t)/.exec(l.text)?.[0].length||0):0;
      if(!out||remove)changes.push({from:l.from,to:l.from+remove,insert:out?'':'  '});
    }
  }
  return changes;
}
module.exports={indentChanges};
