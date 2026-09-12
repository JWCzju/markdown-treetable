const { createHash } = require('node:crypto');
const { parse } = require('./model.cjs');
const { tables, cells } = require('./widths.cjs');
const digest = source => createHash('sha256').update(source).digest('hex');
const listNode = text => /^(\s*)([-+*]|\d+[.)]) (.*)$/.exec(text);
function describe(source, path) {
  const lines = source.split('\n'), offsets = []; let offset = 0;
  for (const line of lines) { offsets.push(offset); offset += line.length + 1; }
  const result = [];
  for (const table of parse(source, path, { autoDetect: true })) if (table.valid) {
    for (const row of table.rows) if (row.hasChildren && Number.isInteger(row.ch)) result.push({
      kind: 'tree', pos: offsets[row.line] + row.ch, shape: row.group ? `group:${row.groupLevel}` : `depth:${row.depth}`,
      explicit: row.explicit, rowKey: row.key
    });
  }
  for (const table of tables(source)) for (let row = table.line + 2; row < table.end; row++) {
    cells(lines[row]).forEach((cell, col) => {
      const segments = cell.text.split(/<br\s*\/?\s*>/i);
      const breaks = [...cell.text.matchAll(/<br\s*\/?\s*>/gi)];
      segments.forEach((text, index) => {
        const n = listNode(text); if (!n) return;
        // Table padding is not list indentation; only the first segment is trimmed by Obsidian.
        const depth = index ? n[1].replace(/\t/g, '    ').length : 0;
        const next = listNode(segments[index + 1] || '');
        if (!next || next[1].replace(/\t/g, '    ').length <= depth) return;
        const segmentOffset = index ? breaks[index - 1].index + breaks[index - 1][0].length : 0;
        result.push({kind: 'cell', pos: offsets[row] + cell.from + segmentOffset + n[1].length,
          shape: `depth:${depth}`, explicit: '', row, col, index});
      });
    });
  }
  return result;
}
const key = entry => `${entry.kind}:${entry.pos}`;
// Native tables may replace a complete cell/row. Narrow each replacement to the
// actual changed characters before mapping anchors, just as normal typing does.
function minimalChanges(before, changes) {
  return changes.map(({from, to, insert}) => {
    let old = before.slice(from, to), start = 0, end = 0;
    while (start < old.length && start < insert.length && old[start] === insert[start]) start++;
    while (end < old.length - start && end < insert.length - start && old[old.length-1-end] === insert[insert.length-1-end]) end++;
    return {from: from + start, to: to - end, insert: insert.slice(start, insert.length - end)};
  }).filter(c => c.from !== c.to || c.insert.length);
}
function mappedPosition(pos, changes) {
  let shift = 0;
  for (const c of changes) {
    if (pos < c.from) break;
    if (pos < c.to) return null; // Deleted/replaced anchor: never transfer to its successor.
    shift += c.insert.length - (c.to - c.from);
  }
  return pos + shift;
}
function canonical(source) {
  const lines = source.split('\n');
  for (const table of tables(source)) {
    for (let i = table.line; i < table.end; i++) lines[i] = i === table.line + 1 ? '<separator>' : JSON.stringify(cells(lines[i]).map(c => c.text.trim()));
  }
  return lines.join('\n');
}
class FoldMemory {
  constructor(saved, changed = () => {}) {
    this.data = saved?.version === 1 && saved.files ? saved : {version: 1, files: {}};
    this.changed = changed; this.cache = new Map();
  }
  sync(path, source) {
    const cached = this.cache.get(path);
    if (cached?.source === source) return cached.nodes;
    const hash = digest(source), previous = this.data.files[path];
    if (previous && previous.hash !== hash) { delete this.data.files[path]; this.changed(); }
    const nodes = describe(source, path);
    this.cache.set(path, {source, nodes, hash});
    return nodes;
  }
  update(path, before, after, changes, external = false) {
    const file = this.data.files[path];
    if (file && file.hash === digest(before) && !external) {
      const edits = minimalChanges(before, changes), nodes = describe(after, path);
      const candidates = new Map(nodes.map(n => [key(n), n]));
      const formattingOnly = canonical(before) === canonical(after);
      const oldNodes = formattingOnly ? describe(before, path) : [];
      const records = [];
      for (const record of file.records) {
        const pos = formattingOnly ? nodes[oldNodes.findIndex(n => key(n) === key(record))]?.pos ?? null : mappedPosition(record.pos, edits);
        const target = pos === null ? null : candidates.get(`${record.kind}:${pos}`);
        if (target && target.shape === record.shape && target.explicit === record.explicit) records.push({...record, pos});
      }
      this.data.files[path] = {hash: digest(after), records};
      this.cache.set(path, {source: after, nodes, hash: digest(after)});
      this.changed();
    } else { this.cache.delete(path); this.sync(path, after); }
  }
  get(path, node) {
    if (!node) return false;
    const record = this.data.files[path]?.records.find(r => key(r) === key(node) && r.shape === node.shape && r.explicit === node.explicit);
    return record ? record.closed : node.explicit === '-';
  }
  set(path, source, node, closed) {
    const nodes = this.sync(path, source);
    const current = node && nodes.find(n => key(n) === key(node) && n.shape === node.shape && n.explicit === node.explicit);
    if (!current) return false;
    const file = this.data.files[path] ||= {hash: digest(source), records: []};
    file.records = file.records.filter(r => key(r) !== key(current));
    const {kind, pos, shape, explicit} = current;
    file.records.push({kind, pos, shape, explicit, closed: !!closed}); this.changed(); return true;
  }
  rename(oldPath, newPath) {
    for (const path of Object.keys(this.data.files)) if (path === oldPath || path.startsWith(oldPath + '/')) {
      const target = newPath + path.slice(oldPath.length);
      this.data.files[target] = this.data.files[path]; delete this.data.files[path];
    }
    this.cache.clear(); this.changed();
  }
  remove(path) {
    for (const name of Object.keys(this.data.files)) if (name === path || name.startsWith(path + '/')) delete this.data.files[name];
    this.cache.clear(); this.changed();
  }
}
module.exports = {FoldMemory, describe, digest, minimalChanges};
