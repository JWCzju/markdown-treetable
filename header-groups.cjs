const { cells } = require('./widths.cjs');

const GROUP = /^\s*#\s+(.+?)\s*<br\s*\/?>\s*(.*?)\s*$/i;

function groupCell(raw) {
  const clean = raw.replace(/<!--[\s\S]*?-->/g, '').trim();
  const match = clean.match(GROUP);
  return match ? { label: match[1].trim(), field: match[2].trim() } : null;
}

function headerGroupChange(source, table, index, label) {
  const lines = source.split('\n');
  const line = lines[table.headerLine];
  if (typeof line !== 'string') return null;
  const list = cells(line);
  const cell = list[index];
  if (!cell) return null;
  const raw = cell.text;
  const current = groupCell(raw);
  const trimmedLabel = String(label ?? '').trim();
  let next;
  if (trimmedLabel) {
    if (current) {
      next = raw.replace(/^\s*#\s+.*?<br\s*\/?>\s*/i, match => {
        const leading = match.match(/^\s*/)?.[0] || '';
        return `${leading}# ${trimmedLabel}<br>`;
      });
    } else {
      const leading = raw.match(/^\s*/)?.[0] || '';
      next = `${leading}# ${trimmedLabel}<br>${raw.slice(leading.length)}`;
    }
  } else if (current) {
    next = raw.replace(/^\s*#\s+.*?<br\s*\/?>\s*/i, match => match.match(/^\s*/)?.[0] || '');
  } else {
    return null;
  }
  if (next === raw) return null;
  const lineStart = lines.slice(0, table.headerLine).reduce((n, value) => n + value.length + 1, 0);
  return { from: lineStart + cell.from, to: lineStart + cell.to, insert: next };
}

module.exports = { GROUP, groupCell, headerGroupChange };
