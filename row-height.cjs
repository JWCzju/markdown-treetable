// Table-local presentation metadata; never rewrite the table body.
const HEIGHT = /^\s*<!--\s*(?:treeTable\s+)?height\s*:\s*(1|2|4|6)\s*-->\s*$/;
function heightMetadata(lines, start) {
  const found = [];
  for (let i = start - 1; i >= 0; i--) {
    if (!lines[i].trim()) continue;
    if (HEIGHT.test(lines[i])) { found.push(i); continue; }
    if (/^\s*<!--\s*tree-table\b.*-->\s*$/.test(lines[i])) continue;
    break;
  }
  return {lines: found, value: found.length ? Number(lines[found[0]].match(HEIGHT)[1]) : 0};
}
function heightChange(source, start, height) {
  const lines = source.split('\n'), meta = heightMetadata(lines, start);
  const offset = line => lines.slice(0, line).reduce((n, s) => n + s.length + 1, 0);
  const value = height === true ? 1 : height || 0;
  if (value && ![1,2,4,6].includes(value)) throw new Error('Unsupported row height');
  if (value && meta.value === value && meta.lines.length === 1) return [];
  if (value && meta.lines.length) return [{from:offset(meta.lines[0]), to:offset(meta.lines[0])+lines[meta.lines[0]].length, insert:`<!-- treeTable height: ${value} -->`}];
  if (value) {
    // Reuse the existing separator instead of adding a second blank line.
    const separator = start > 0 && lines[start - 1] === '';
    return [{from:offset(separator ? start - 1 : start), insert:`<!-- treeTable height: ${value} -->\n` + (separator ? '' : '\n')}];
  }
  return meta.lines.map(line => ({from:offset(line), to:offset(line) + lines[line].length + 1, insert:''}));
}
module.exports = {HEIGHT, heightMetadata, heightChange};
