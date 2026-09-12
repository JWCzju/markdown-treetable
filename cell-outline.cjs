const { Compartment } = require('@codemirror/state');
const { foldService, codeFolding, foldCode, unfoldCode } = require('@codemirror/language');
const { ViewPlugin, Decoration, WidgetType } = require('@codemirror/view');
function ancestorDepths(lines, index) {
  const result=[]; let depth=node(lines[index])?.depth || 0;
  for(let i=index-1;i>=0 && depth>0;i--) { const parent=node(lines[i]); if(parent && parent.depth<depth) {result.unshift(parent.depth);depth=parent.depth;} }
  return result;
}
function outlineStyle(depth) {
  return `--mte-outline-indent:${depth*.6}em;`;
}
class Bullet extends WidgetType {
  eq() { return true; }
  toDOM() { const span=document.createElement('span'); span.className='mte-outline-bullet-widget'; span.textContent='•'; return span; }
  ignoreEvent() { return false; }
}
class TaskBox extends WidgetType {
  constructor(checked, pos) { super(); this.checked=checked; this.pos=pos; }
  eq(other) { return other.checked===this.checked && other.pos===this.pos; }
  toDOM(view) {
    const box=document.createElement('input'); box.type='checkbox'; box.className='task-list-item-checkbox mte-task-box'; box.checked=this.checked;
    box.setAttribute('aria-label', '切换待办状态');
    box.addEventListener('mousedown', e=>e.preventDefault());
    box.addEventListener('click', e=>{e.stopPropagation();view.dispatch({changes:{from:this.pos,to:this.pos+1,insert:box.checked?'x':' '},userEvent:'input'});});
    const slot=document.createElement('span'); slot.className='mte-task-slot'; slot.append(box); return slot;
  }
  ignoreEvent() { return true; }
}
const bullets = ViewPlugin.fromClass(class {
  constructor(view) { this.updateMarks(view); }
  update(update) { if (update.docChanged || update.selectionSet) this.updateMarks(update.view); }
  updateMarks(view) {
    const marks = [];
    for (let i=1; i<=view.state.doc.lines; i++) { const line=view.state.doc.line(i); const n=node(line.text); if(n) { marks.push(Decoration.line({attributes:{class:'mte-outline-edit-line'+(n.task?' mte-outline-task':'')+(n.checked?' mte-outline-task-done':''),style:outlineStyle(n.depth,ancestorDepths(view.state.doc.toString().split('\n'),i-1))}}).range(line.from)); const prefixEnd=line.from+n.indent.length+n.marker.length+(n.task?5:1); const selected=view.state.selection.ranges.some(r=>!r.empty && r.from<prefixEnd && r.to>line.from); if(selected) continue; if(n.task) marks.push(Decoration.replace({widget:new TaskBox(n.checked,line.from+n.indent.length+n.marker.length+2)}).range(line.from,line.from+n.indent.length+n.marker.length+5)); else if(!/^\d/.test(n.marker)) marks.push(Decoration.replace({widget:new Bullet()}).range(line.from,line.from+n.indent.length+2)); } }
    this.decorations=Decoration.set(marks, true);
  }
}, {decorations: value=>value.decorations});

function node(text) {
  const m = /^(\s*)([-+*]|\d+[.)]) (.*)$/.exec(text);
  return m && { indent: m[1], depth: m[1].replace(/\t/g, '    ').length, marker: m[2], body: m[3], task: /^\[[ xX]\] /.test(m[3]), checked: /^\[[xX]\]/.test(m[3]) };
}
function endOfSubtree(doc, number) {
  const parent = node(doc.line(number).text);
  if (!parent) return number;
  let end = number;
  for (let i = number + 1; i <= doc.lines; i++) {
    const text = doc.line(i).text;
    if (!text.trim()) break;
    const child = node(text);
    if (child ? child.depth <= parent.depth : !text.startsWith(parent.indent + '  ')) break;
    end = i;
  }
  return end;
}
function insert(view, child) {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const n = node(line.text);
  if (!n) return false;
  const end = view.state.doc.line(endOfSubtree(view.state.doc, line.number));
  const text = '\n' + n.indent + (child ? '  ' : '') + n.marker + ' ' + (n.task ? '[ ] ' : '');
  view.dispatch({ changes: { from: end.to, insert: text }, selection: { anchor: end.to + text.length }, userEvent: 'input', scrollIntoView: true });
  return true;
}
function contextNode(doc, number) {
  const direct = node(doc.line(number).text);
  if (direct) return direct;
  const text = doc.line(number).text;
  for (let i=number-1;i>=1;i--) {
    const parent=node(doc.line(i).text);
    if (parent) return text.startsWith(parent.indent + '  ') ? parent : null;
    if (!doc.line(i).text.trim()) break;
  }
  return null;
}
function moveOrdered(view, down) {
  const line=view.state.doc.lineAt(view.state.selection.main.head), n=node(line.text);
  if (!n || !/^\d+[.)]$/.test(n.marker)) return false;
  const targetNo=line.number+(down?1:-1); if(targetNo<1||targetNo>view.state.doc.lines)return false;
  const other=node(view.state.doc.line(targetNo).text); if(!other||other.depth!==n.depth||!/^\d+[.)]$/.test(other.marker))return false;
  const a=line.text.replace(n.marker,other.marker), b=view.state.doc.line(targetNo).text.replace(other.marker,n.marker);
  view.dispatch({changes:[{from:line.from,to:line.to,insert:b},{from:view.state.doc.line(targetNo).from,to:view.state.doc.line(targetNo).to,insert:a}],userEvent:'input.move'}); return true;
}
function toggleTask(view) {
  const line = view.state.doc.lineAt(view.state.selection.main.head); const n = node(line.text);
  if (!n) {
    const indent = /^\s*/.exec(line.text)[0].length;
    view.dispatch({changes:{from:line.from+indent,insert:'- [ ] '},userEvent:'input'});
    return true;
  }
  const base = line.text.slice(0, line.text.length - n.body.length);
  if (n.task) {
    const pos = line.from + base.length + 1;
    view.dispatch({changes:{from:pos,to:pos+1,insert:n.checked?' ':'x'},userEvent:'input'});
  } else {
    view.dispatch({changes:{from:line.from,to:line.from+base.length,insert:base+'[ ] '} ,userEvent:'input'});
  }
  return true;
}
function enter(view, soft) {
  const selection = view.state.selection.main;
  const line = view.state.doc.lineAt(selection.from);
  const n = contextNode(view.state.doc, line.number);
  if (!n) return false;
  let from = selection.from, to = selection.to, text;
  if (soft) text = '\n' + n.indent + ' '.repeat(n.marker.length + 1);
  else if (!(n.task ? n.body.slice(4) : n.body).trim()) {
    from = line.from; to = line.to;
    text = n.indent.length ? n.indent.slice(0, -2) + n.marker + ' ' + (n.task ? '[ ] ' : '') : '';
  } else {
    const ordered = /^(\d+)([.)])$/.exec(n.marker);
    const marker = ordered ? `${Number(ordered[1])+1}${ordered[2]}` : n.marker;
    text = '\n' + n.indent + marker + ' ' + (/^\[[ xX]\] /.test(n.body) ? '[ ] ' : '');
  }
  view.dispatch({changes:{from,to,insert:text},selection:{anchor:from+text.length},userEvent:'input',scrollIntoView:true});
  return true;
}
function indent(view, out) {
  const doc = view.state.doc;
  const first = doc.lineAt(view.state.selection.main.from);
  const n = node(first.text);
  if (!n) return false;
  const end = Math.max(endOfSubtree(doc, first.number), doc.lineAt(view.state.selection.main.to).number);
  const changes = [];
  for (let i = first.number; i <= end; i++) {
    const l = doc.line(i);
    const remove = out ? (/^( {1,2}|\t)/.exec(l.text)?.[0].length || 0) : 0;
    if (!out || remove) changes.push({ from: l.from, to: l.from + remove, insert: out ? '' : '  ' });
  }
  if (changes.length) view.dispatch({ changes, userEvent: 'input.indent', scrollIntoView: true });
  return true;
}
function foldKey(view, wrapper, index) { return String(view.file?.path)+"|"+String([...view.containerEl.querySelectorAll(".table-cell-wrapper")].indexOf(wrapper))+"|"+index; }
class CellOutline {
  constructor(plugin) {
    this.plugin = plugin;
    this.editors = new Map();
    this.previews = new Set();
    plugin.registerDomEvent(document, 'keydown', event => this.key(event), true);
    const command=plugin.app.commands.commands['editor:toggle-checklist-status'];
    if(command?.checkCallback) {
      const original=command.checkCallback;
      const wrapped=checking=>{
        for(const leaf of plugin.app.workspace.getLeavesOfType('markdown')) {
          const cell=(leaf.view.currentMode||leaf.view.editMode)?.tableCell;
          if(cell?.editor?.cm?.contentDOM.contains(document.activeElement) && this.enabled(leaf.view)) {
            if(!checking) toggleTask(cell.editor.cm);
            return true;
          }
        }
        return original(checking);
      };
      command.checkCallback=wrapped;
      plugin.register(()=>{if(command.checkCallback===wrapped)command.checkCallback=original;});
    }

  }
  enabled(view) { return this.plugin.cellMarkdownGlobal || /<!--\s*cell-markdown\s*-->/.test(view.editor?.getValue() || ''); }
  scan(view) {
    for (const [cm] of this.editors) if (cm.destroyed) this.editors.delete(cm);
    for (const entry of this.previews) if (!entry.wrapper.isConnected || !entry.wrapper.querySelector('.mte-outline-preview-line')) this.previews.delete(entry);
    if (!this.enabled(view)) return;
    for (const table of view.containerEl.querySelectorAll('table.table-editor')) {
      table.classList.add('mte-outline-table');
      for (const wrapper of table.querySelectorAll('.table-cell-wrapper')) {
        if (wrapper.querySelector('.cm-editor')) continue;
        // Preserve native inline nodes (including image embeds and their handlers).
        // Block widgets such as details and embedded notes remain owned by Obsidian.
        if ([...wrapper.childNodes].some(n => n.nodeType !== 3 &&
          !(n.nodeType === 1 && (n.matches('br, a, strong, em, b, i, del, s, code, mark, img') ||
            (n.matches('span') && (!n.classList.contains('internal-embed') || n.classList.contains('image-embed'))))))) continue;
        const parts = [[]];
        for (const child of wrapper.childNodes) {
          if (child.nodeName === 'BR') parts.push([]);
          else parts[parts.length - 1].push(child);
        }
        // Parse only the leading text, never text inside links or rich widgets.
        const lines = parts.map(nodes => {
          let text = '';
          for (const child of nodes) { if (child.nodeType !== 3) break; text += child.textContent; }
          return text;
        });
        if (!lines.some(text => node(text))) continue;
        const original = [...wrapper.childNodes];
        wrapper.replaceChildren();
        let hiddenDepth = null;
        lines.forEach((text, i) => {
          const line = document.createElement('span'); line.className = 'mte-outline-preview-line';
          const item = node(text);
          let isClosed = false;
          let hasChildren = false;
          let skip = item ? item.indent.length + item.marker.length + 1 + (item.task ? 4 : 0) : 0;
          const bodyNodes = parts[i].map(child => {
            if (child.nodeType !== 3) return child;
            const value = child.textContent.slice(skip);
            skip = Math.max(0, skip - child.textContent.length);
            return document.createTextNode(value);
          });
          if (item) {
            const key=foldKey(view,wrapper,i); hasChildren=!item.task && lines.slice(i+1).some(t=>node(t)?.depth>item.depth); isClosed=!!this.plugin.cellFolds[key];
            if (hiddenDepth !== null && item.depth <= hiddenDepth) hiddenDepth = null;
            if (hiddenDepth !== null) line.classList.add('mte-cell-fold-hidden');
            if (hasChildren) { line.classList.add('mte-cell-fold-parent'); line.classList.toggle('mte-cell-fold-closed',isClosed); }
            line.style.cssText = outlineStyle(item.depth,ancestorDepths(lines,i));
            const bullet = document.createElement('span'); bullet.className = 'mte-outline-marker'; bullet.textContent = /^\d/.test(item.marker) ? item.marker + ' ' : '• ';
            if (hasChildren) { bullet.classList.add('mte-cell-fold-hit'); bullet.addEventListener('pointerdown', e=>{e.preventDefault();e.stopPropagation();}); bullet.addEventListener('click', e=>{e.preventDefault();e.stopPropagation(); if(this.plugin.cellFolds[key]) delete this.plugin.cellFolds[key]; else this.plugin.cellFolds[key]=true; this.plugin.saveState(); wrapper.querySelectorAll('.mte-cell-fold-hidden').forEach(el=>el.classList.remove('mte-cell-fold-hidden')); line.classList.toggle('mte-cell-fold-closed',!!this.plugin.cellFolds[key]); this.plugin.schedule();}); }
            if (/^\d/.test(item.marker)) bullet.classList.add('mte-outline-ordered');
            if (item.task) {
              line.classList.add('mte-outline-task');
              line.classList.toggle('mte-outline-task-done', item.checked);
              const box=document.createElement('input'); box.type='checkbox'; box.checked=item.checked; box.className='task-list-item-checkbox mte-task-box'; box.setAttribute('aria-label','切换待办状态');
              box.addEventListener('pointerdown', e=>e.stopPropagation());
              box.addEventListener('mousedown', e=>{e.preventDefault();e.stopPropagation();});
              box.addEventListener('click', e=>{e.stopPropagation();this.togglePreview(view, wrapper, i, item.checked);});
              const body=document.createElement('span'); body.className='mte-task-body'; body.append(...bodyNodes);
              const slot=document.createElement('span'); slot.className='mte-task-slot'; slot.append(box);
              line.append(slot,body);
            } else line.append(bullet, ...bodyNodes);
          } else line.append(...bodyNodes);
          if (isClosed && hasChildren) hiddenDepth = item.depth;
          wrapper.append(line); if (i < lines.length - 1) wrapper.append(document.createElement('br'));
        });
        this.previews.add({ wrapper, original });
      }
    }
    const cell = (view.currentMode || view.editMode)?.tableCell;
    const cm = cell?.editor?.cm;
    if (!cm || this.editors.has(cm)) return;
    const compartment = new Compartment();
    const service = foldService.of((state, from) => {
      const line = state.doc.lineAt(from); const end = endOfSubtree(state.doc, line.number);
      return end > line.number ? { from: line.to, to: state.doc.line(end).to } : null;
    });
    cm.dispatch({ effects: require('@codemirror/state').StateEffect.appendConfig.of(compartment.of([service, codeFolding(), bullets])) });
    cm.dom.classList.add('mte-outline-editor');
    this.editors.set(cm, compartment);
  }
  togglePreview(view, wrapper, itemIndex, checked) {
    const td=wrapper.closest('td'); const table=td?.closest('table.table-editor');
    const row=td?.parentElement; const cm=view.editor.cm;
    if (!table || !row) return;
    try {
      const start=cm.state.doc.lineAt(cm.posAtDOM(table)).number;
      const source=cm.state.doc.line(start+1+[...table.tBodies[0].rows].indexOf(row)+1);
      const pipes=[];
      for(let i=0;i<source.text.length;i++) if(source.text[i]==='|') { let n=0;for(let j=i-1;j>=0 && source.text[j]==='\\';j--) n++;if(n%2===0)pipes.push(i); }
      const col=td.cellIndex; const from=pipes[col]+1; const to=pipes[col+1];
      if(!Number.isFinite(from)||!Number.isFinite(to))return;
      const raw=source.text.slice(from,to); const segments=raw.split(/<br\s*\/?\s*>/i);
      const segment=segments[itemIndex]; const match=/^\s*[-+*] \[([ xX])\] /.exec(segment||'');
      if(!match || /[xX]/.test(match[1])!==checked)return;
      let offset=0; const breaks=[...raw.matchAll(/<br\s*\/?\s*>/gi)];
      if(itemIndex)offset=breaks[itemIndex-1].index+breaks[itemIndex-1][0].length;
      const pos=source.from+from+offset+match[0].indexOf('[')+1;
      cm.dispatch({changes:{from:pos,to:pos+1,insert:checked?' ':'x'},userEvent:'input'});
    } catch (_) { this.plugin.schedule(); }
  }
  key(event) {
    if (event.isComposing || event.defaultPrevented) return;
    const leaf = this.plugin.app.workspace.getLeavesOfType('markdown').find(l => l.view.containerEl.contains(event.target));
    if (!leaf || !this.enabled(leaf.view)) return;
    const cell = (leaf.view.currentMode || leaf.view.editMode)?.tableCell;
    const cm = cell?.editor?.cm;
    if (!cm || !cm.contentDOM.contains(event.target)) return;
    const n = contextNode(cm.state.doc, cm.state.doc.lineAt(cm.state.selection.main.head).number);
    const taskHotkey = (event.metaKey || event.ctrlKey) && event.altKey && !event.shiftKey && event.code === 'KeyT';
    if (!n && !taskHotkey) return;
    let action;
    if (taskHotkey) action = () => toggleTask(cm);
    else if (!event.altKey && !event.metaKey && !event.ctrlKey && event.key === 'Enter') action = () => enter(cm, event.shiftKey);
    else if (event.altKey && !event.metaKey && !event.ctrlKey && event.key === 'Enter') action = () => insert(cm, false);
    else if (event.altKey && !event.metaKey && !event.ctrlKey && event.key === 'Tab') action = () => insert(cm, true);
    else if (!event.altKey && !event.metaKey && !event.ctrlKey && event.key === 'Tab') action = () => indent(cm, event.shiftKey);
    else if ((event.metaKey || event.ctrlKey) && event.altKey && event.code === 'ArrowLeft') action = () => foldCode(cm);
    else if ((event.metaKey || event.ctrlKey) && event.altKey && event.code === 'ArrowRight') action = () => unfoldCode(cm);
    if (!action) return;
    event.preventDefault(); event.stopImmediatePropagation(); action();
  }
  destroy() {
    for (const [cm, compartment] of this.editors) if (!cm.destroyed) { cm.dispatch({ effects: compartment.reconfigure([]) }); cm.dom.classList.remove('mte-outline-editor'); }
    for (const { wrapper, original } of this.previews) if (wrapper.isConnected && wrapper.querySelector('.mte-outline-preview-line') && !wrapper.querySelector('.cm-editor')) wrapper.replaceChildren(...original);
    for (const e of document.querySelectorAll('.mte-outline-table')) e.classList.remove('mte-outline-table');
    this.editors.clear(); this.previews.clear();
  }
}
module.exports = { CellOutline, node, endOfSubtree, insert, indent };
