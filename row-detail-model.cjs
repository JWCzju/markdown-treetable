function cellSpan(line, column) {
  const pipes = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== '|') continue;
    let slashes = 0;
    for (let j = i - 1; j >= 0 && line[j] === '\\'; j--) slashes++;
    if (slashes % 2 === 0) pipes.push(i);
  }
  const leading = line.trimStart().startsWith('|');
  const starts = leading ? pipes.map(index => index + 1) : [0, ...pipes.map(index => index + 1)];
  const ends = leading ? pipes.slice(1) : pipes;
  if (!line.trimEnd().endsWith('|')) ends.push(line.length);
  if (column < 0 || column >= starts.length || ends[column] == null) return null;
  return {start:starts[column], end:ends[column]};
}

function escapePipes(value) {
  let result = '';
  let slashes = 0;
  for (const char of value) {
    if (char === '|' && slashes % 2 === 0) result += '\\';
    result += char;
    slashes = char === '\\' ? slashes + 1 : 0;
  }
  return result;
}

function replaceCell(line, column, value) {
  const span = cellSpan(line, column);
  if (!span) return null;
  const current = line.slice(span.start, span.end);
  const left = current.match(/^\s*/)[0];
  const right = current.match(/\s*$/)[0];
  const next = escapePipes(value.replace(/\r?\n/g, '<br>'));
  return line.slice(0, span.start) + left + next + right + line.slice(span.end);
}

function fieldInfo(header) {
  const group = header.match(/<!--\s*detail-group="([^"]+)"\s*-->/)?.[1] || '';
  const label = header.replace(/<!--[^]*?-->/g, '').trim();
  return {label, group};
}

module.exports = {cellSpan, replaceCell, fieldInfo};
