const MarkdownIt = require('markdown-it');
const md = new MarkdownIt();
const prefixPattern = /^(?:(>+)([+-])?\s+|([+-])\s+(?!\[[ xX]\]\s))/;

function hierarchy(text) {
  const group = text.match(/^(#{1,3})([+-])?\s+/);
  if (group) return { group: true, depth: group[1].length - 1, groupLevel: group[1].length, explicit: group[2] || '', prefix: group[0], label: text.slice(group[0].length) };
  const match = text.match(prefixPattern);
  return { depth: match?.[1]?.length || 0, explicit: match?.[2] || match?.[3] || '', prefix: match?.[0] || '', label: text.slice(match?.[0].length || 0) };
}

// Locate pipe boundaries using the same escape convention as markdown-it's table rule.
function cellStarts(line) {
  const boundaries = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== '|') continue;
    let slashes = 0;
    for (let j = i - 1; j >= 0 && line[j] === '\\'; j--) slashes++;
    if (!(slashes % 2)) boundaries.push(i);
  }
  const leading = line.trimStart().startsWith('|');
  const starts = leading ? boundaries.map(i => i + 1) : [0, ...boundaries.map(i => i + 1)];
  if (line.trimEnd().endsWith('|')) starts.pop();
  return starts.map(i => i + (line.slice(i).match(/^\s*/)?.[0].length || 0));
}

function parse(source, path = '', options = {}) {
  const lines = source.split('\n');
  const tokens = md.parse(source, {});
  const tables = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type !== 'table_open' || token.level !== 0) continue;
    const start = token.map[0];
    let previous = start - 1;
    while (previous >= 0 && !lines[previous].trim()) previous--;
    const marker = lines[previous]?.match(/^\s*<!--\s*tree-table(?:\s+column=(?:"([^"]+)"|([0-9]+)))?(?:\s+id="([a-zA-Z0-9_-]+)")?\s*-->\s*$/);
    const firstData = lines[start + 2] || '';
    const firstCell = firstData.split('|')[1]?.trim() || '';
    const auto = !marker && options.autoDetect && /^(?:#{1,3}\s+|>+\s+)/.test(firstCell);
    if (!marker && !auto) continue;
    const headers = [], rows = [];
    let current = null, inHead = false;
    for (let j = i + 1; j < tokens.length && tokens[j].type !== 'table_close'; j++) {
      const t = tokens[j];
      if (t.type === 'thead_open') inHead = true;
      if (t.type === 'thead_close') inHead = false;
      if (t.type === 'tr_open') { current = []; if (!inHead) rows.push({ cells: current, line: t.map?.[0] ?? start + 2 + rows.length }); }
      if (t.type === 'inline') (inHead ? headers : current)?.push(t.content.trim());
    }
    const columnSpec = marker ? (marker[1] ?? marker[2]) : 0;
    const col = columnSpec == null ? 0 : (/^\d+$/.test(columnSpec) ? Number(columnSpec) : headers.indexOf(columnSpec));
    if (col < 0 || col >= headers.length || (columnSpec != null && !/^\d+$/.test(columnSpec) && headers.filter(h => h === columnSpec).length !== 1)) continue;
    let valid = true;
    const stack = [];
    let group = null;
    for (let n = 0; n < rows.length; n++) {
      const row = rows[n];
      Object.assign(row, hierarchy(row.cells[col] || ''));
      if (!row.group && ((n === 0 && row.depth !== 0) || (n > 0 && row.depth > (rows[n - 1].group ? -1 : rows[n - 1].depth) + 1))) valid = false;
      if (row.group) { group = row.label; stack.length = 0; }
      stack.length = row.depth;
      stack[row.depth] = row.label;
      row.identity = JSON.stringify(row.group ? { group } : group !== null ? { group, path: stack } : stack);
      const next = n + 1 < rows.length ? hierarchy(rows[n + 1].cells[col] || '') : null;
      row.hasChildren = !!next && !next.group && (row.group || next.depth > row.depth);
      row.markerOffset = row.group ? 1 : row.depth;
      row.ch = cellStarts(lines[row.line])[col];
      // Refuse source export if the raw prefix cannot be mapped exactly.
      row.writable = Number.isInteger(row.ch) && lines[row.line].slice(row.ch).startsWith(row.prefix);
    }
    // The table ordinal is stable while editing its content. An explicit id remains
    // available when tables are frequently reordered within the same note.
    const identity = marker?.[3] || `table-${tables.length}`;
    const table = { start, end: token.map[1], col, headers, rows, valid: auto ? true : valid, identity, path };
    const occurrences = new Map();
    for (const row of rows) {
      row.occurrence = occurrences.get(row.identity) || 0;
      occurrences.set(row.identity, row.occurrence + 1);
      row.unique = true;
      row.key = JSON.stringify([path, identity, row.identity, row.occurrence]);
    }
    tables.push(table);
  }
  for (const table of tables) if (tables.filter(t => t.identity === table.identity).length > 1) table.valid = false;
  return tables;
}

function folded(row, states) {
  const stored = states[row.key];
  return stored && stored.explicit === row.explicit ? stored.closed : row.explicit === '-';
}

function visibility(rows, states) {
  let hiddenAt = null;
  let groupClosed = false;
  return rows.map(row => {
    if (row.group) {
      hiddenAt = null;
      groupClosed = row.hasChildren && folded(row, states);
      return false;
    }
    if (hiddenAt !== null && row.depth <= hiddenAt) hiddenAt = null;
    const hidden = hiddenAt !== null;
    if (!hidden && row.hasChildren && folded(row, states)) hiddenAt = row.depth;
    return groupClosed || hidden;
  });
}

module.exports = { parse, hierarchy, folded, visibility };
