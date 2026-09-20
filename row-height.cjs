// Table-local presentation metadata; never rewrite the table body.
const HEIGHT = /^\s*<!--\s*height\s*:\s*1\s*-->\s*$/;
function heightMetadata(lines, start) {
  const found = [];
  for (let i = start - 1; i >= 0; i--) {
    if (!lines[i].trim()) continue;
    if (HEIGHT.test(lines[i])) { found.push(i); continue; }
    if (/^\s*<!--\s*tree-table\b.*-->\s*$/.test(lines[i])) continue;
    break;
  }
  return {lines: found};
}
function heightChange(source, start, enabled) {
  const lines = source.split('\n'), meta = heightMetadata(lines, start);
  const offset = line => lines.slice(0, line).reduce((n, s) => n + s.length + 1, 0);
  if (enabled) {
    if (meta.lines.length) return [];
    // Reuse the existing separator instead of adding a second blank line.
    const separator = start > 0 && lines[start - 1] === '';
    return [{from:offset(separator ? start - 1 : start), insert:'<!-- height: 1 -->\n' + (separator ? '' : '\n')}];
  }
  return meta.lines.map(line => ({from:offset(line), to:offset(line) + lines[line].length + 1, insert:''}));
}
module.exports = {heightMetadata, heightChange};
