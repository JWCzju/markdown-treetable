const { createHash, randomUUID } = require('node:crypto');
const { parse } = require('./model.cjs');
const { tables, cells, WIDTH } = require('./widths.cjs');
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
        let endIndex = index + 1;
        while (endIndex < segments.length) {
          const child = listNode(segments[endIndex]);
          if (child && child[1].replace(/\t/g, '    ').length <= depth) break;
          endIndex++;
        }
        const end = offsets[row] + cell.from + (endIndex < segments.length ? breaks[endIndex - 1].index : cell.text.length);
        result.push({kind: 'cell', pos: offsets[row] + cell.from + segmentOffset + n[1].length,
          end, shape: `depth:${depth}`, explicit: '', row, col, index});
      });
    });
  }
  const normalize = text => text.replace(WIDTH, '').replace(/\[[ xX]\]/g, '[ ]').trim();
  const descriptors = tables(source);
  for (const n of result) {
    const row = n.row ?? offsets.findLastIndex(p => p <= n.pos);
    const table = descriptors.find(t => row >= t.line + 2 && row < t.end);
    if (!table) continue;
    const col = n.col ?? cells(lines[row]).findIndex(c => n.pos < offsets[row] + c.to);
    const header = table.cells.map(c => normalize(c.text));
    n.scope = digest(JSON.stringify([...header].sort()));
    n.column = digest(header[col] || '');
    let label, children;
    if (n.kind === 'cell') {
      const segments = cells(lines[row])[col].text.split(/<br\s*\/?\s*>/i);
      label = normalize(listNode(segments[n.index])?.[3] || '');
      children = normalize(source.slice(n.pos, n.end).replace(/^[^]*?<br\s*\/?\s*>/i, ''));
    } else {
      label = normalize(cells(lines[row])[col]?.text || '').replace(/^(?:#+|>*)[+-]?\s*/, '');
      const following = result.filter(x => x.kind === 'tree' && x.pos > n.pos);
      const boundary = following.find(x => x.shape === n.shape)?.pos ?? (offsets[table.end] ?? source.length);
      children = lines.slice(row + 1, offsets.findIndex(p => p >= boundary) < 0 ? table.end : offsets.findIndex(p => p >= boundary))
        .map(line => cells(line).map(c => normalize(c.text))).flat().join('\n');
    }
    n.label = digest(label);
    n.children = digest(children);
    n.identity = digest(JSON.stringify([n.kind, n.scope, n.column, label, children]));
    n.context = digest(JSON.stringify(cells(lines[row]).filter((_, i) => i !== col).map(c => normalize(c.text)).sort()));
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
    for (let i = table.line; i < table.end; i++) lines[i] = i === table.line + 1 ? '<separator>' : JSON.stringify(cells(lines[i]).map(c => (i === table.line ? c.text.replace(WIDTH, '') : c.text).trim()));
  }
  return lines.join('\n');
}
function columnMoves(before, after, oldNodes, nodes) {
  const a = tables(before), b = tables(after), result = new Map();
  const oldLines = before.split('\n'), newLines = after.split('\n');
  if (a.length !== b.length) return result;
  const signatures = (table, lines) => table.cells.map((_, col) => JSON.stringify(
    lines.slice(table.line, table.end).filter((_, i) => i !== 1).map((line, i) => {
      const text = cells(line)[col]?.text || '';
      return (i === 0 ? text.replace(WIDTH, '') : text).trim();
    })));
  a.forEach((table, i) => {
    const next = b[i], left = signatures(table, oldLines), right = signatures(next, newLines);
    const reordered = JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
    const headers = t => t.cells.map(c => c.text.replace(WIDTH, '').trim());
    const sameColumns = JSON.stringify(headers(table)) === JSON.stringify(headers(next));
    if (!reordered && (!sameColumns || table.end - table.line !== next.end - next.line)) return;
    // Only unambiguous, complete columns can carry memory through a reorder.
    for (const old of oldNodes.filter(n => n.kind === 'cell' && n.row >= table.line + 2 && n.row < table.end)) {
      const signature = left[old.col];
      const col = reordered ? right.indexOf(signature) : old.col;
      if (reordered && (left.indexOf(signature) !== left.lastIndexOf(signature) || right.indexOf(signature) !== right.lastIndexOf(signature))) continue;
      const row = next.line + old.row - table.line;
      const oldCell = cells(oldLines[old.row])[old.col], newCell = cells(newLines[row])[col];
      if (!oldCell || !newCell) continue;
      if (oldCell.text.split(/<br\s*\/?\s*>/i).length !== newCell.text.split(/<br\s*\/?\s*>/i).length) continue;
      const oldStart = oldLines.slice(0, old.row).reduce((n, line) => n + line.length + 1, 0) + oldCell.from;
      const newStart = newLines.slice(0, row).reduce((n, line) => n + line.length + 1, 0) + newCell.from;
      const relative = mappedPosition(old.pos - oldStart, minimalChanges(oldCell.text, [{from:0, to:oldCell.text.length, insert:newCell.text}]));
      const target = relative === null ? null : nodes.find(n => n.kind === 'cell' && n.row === row && n.col === col && n.pos === newStart + relative);
      if (target) result.set(key(old), target.pos);
    }
  });
  return result;
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
    const nodes = describe(source, path);
    if (previous?.identities) this.reconcile(path, nodes, hash);
    else if (previous) {
      // Legacy offsets are trustworthy only against their original fingerprint.
      const records = previous.hash === hash ? previous.records : [];
      nodes.forEach(n => { n.id = randomUUID(); });
      this.data.files[path] = {hash, records: records.map(r => ({...r, id:nodes.find(n => key(n) === key(r))?.id})), identities:nodes};
      this.changed();
    } else nodes.forEach(n => { n.id = randomUUID(); });
    this.cache.set(path, {source, nodes, hash});
    return nodes;
  }
  update(path, before, after, changes, external = false) {
    if (this.data.files[path] && !this.data.files[path].identities) {
      this.cache.delete(path);
      this.sync(path, before);
    }
    if (this.data.files[path]?.identities) {
      const nodes = describe(after, path), hash = digest(after);
      this.reconcile(path, nodes, hash, this.data.files[path].hash === digest(before) && !external ? minimalChanges(before, changes) : null);
      this.cache.set(path, {source:after, nodes, hash});
      return;
    }
    const file = this.data.files[path];
    if (file && file.hash === digest(before) && !external) {
      const edits = minimalChanges(before, changes), nodes = describe(after, path);
      const candidates = new Map(nodes.map(n => [key(n), n]));
      const formattingOnly = canonical(before) === canonical(after);
      const oldNodes = describe(before, path);
      const moved = columnMoves(before, after, oldNodes, nodes);
      const records = [];
      for (const record of file.records) {
        const pos = formattingOnly ? nodes[oldNodes.findIndex(n => key(n) === key(record))]?.pos ?? null : moved.get(key(record)) ?? mappedPosition(record.pos, edits);
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
    const record = this.data.files[path]?.records.find(r => (node.id && r.id ? r.id === node.id : key(r) === key(node)) && r.explicit === node.explicit);
    return record ? record.closed : node.explicit === '-';
  }
  set(path, source, node, closed) {
    const nodes = this.sync(path, source);
    const current = node && nodes.find(n => key(n) === key(node) && n.shape === node.shape && n.explicit === node.explicit);
    if (!current) return false;
    const file = this.data.files[path] ||= {hash: digest(source), records: [], identities:nodes};
    file.records = file.records.filter(r => key(r) !== key(current));
    const {kind, pos, shape, explicit, id} = current;
    file.records.push({kind, pos, shape, explicit, id, closed: !!closed}); this.changed(); return true;
  }
  reconcile(path, nodes, hash, edits = null) {
    const file = this.data.files[path], old = file.identities;
    const available = new Set(old), pending = new Set(nodes), matched = new Map();
    const accept = (a, b) => { b.id = a.id; available.delete(a); pending.delete(b); matched.set(a.id, b); };
    // Each pass requires a unique match in BOTH directions; copies and duplicates
    // must not silently inherit an unrelated node's fold state.
    const pass = predicate => {
      const pairs = [];
      for (const b of pending) {
        const candidates = [...available].filter(a => a.kind === b.kind && predicate(a, b));
        if (candidates.length === 1 && [...pending].filter(c => c.kind === candidates[0].kind && predicate(candidates[0], c)).length === 1) pairs.push([candidates[0], b]);
      }
      pairs.forEach(([a,b]) => accept(a,b));
    };
    if (file.hash === hash) pass((a,b) => a.pos === b.pos);
    pass((a,b) => a.identity === b.identity);
    pass((a,b) => a.scope === b.scope && a.column === b.column && a.label === b.label && a.context === b.context);
    pass((a,b) => a.scope === b.scope && a.column === b.column && a.children === b.children && a.context === b.context && a.shape === b.shape);
    pass((a,b) => a.scope === b.scope && a.column === b.column && a.label === b.label);
    pass((a,b) => a.scope === b.scope && a.column === b.column && a.children === b.children && a.shape === b.shape);
    if (edits) pass((a,b) => mappedPosition(a.pos, edits) === b.pos && a.shape === b.shape && a.label === b.label);
    for (const n of pending) n.id = randomUUID();
    const records = file.records.flatMap(r => {
      const n = matched.get(r.id);
      return n && n.explicit === r.explicit ? [{kind:n.kind, pos:n.pos, shape:n.shape, explicit:n.explicit, id:n.id, closed:r.closed}] : [];
    });
    this.data.files[path] = {hash, records, identities:nodes};
    this.changed();
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
