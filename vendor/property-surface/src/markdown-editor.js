const { indentChanges } = require('./list-indent');
const { EditorState, StateField, Prec } = require('@codemirror/state');
const { EditorView, Decoration, WidgetType, keymap } = require('@codemirror/view');
const { history, historyKeymap, defaultKeymap, undo, redo } = require('@codemirror/commands');
const { parser, GFM } = require('@lezer/markdown');
const markdown = parser.configure(GFM);

class Marker extends WidgetType {
  constructor(text, checked = null, position = 0) { super(); Object.assign(this, {text, checked, position}); }
  eq(other) { return this.text === other.text && this.checked === other.checked && this.position === other.position; }
  toDOM(view) {
    const slot = view.dom.ownerDocument.createElement('span');
    slot.className = 'mpv-marker';
    const el = this.checked === null ? slot : slot.appendChild(view.dom.ownerDocument.createElement('input'));
    if (this.checked === null) el.textContent = this.text;
    else {
      el.type = 'checkbox'; el.checked = this.checked; el.setAttribute('aria-label', '切换待办状态');
      el.addEventListener('mousedown', e => e.preventDefault());
      el.addEventListener('click', e => {
        e.stopPropagation();
        view.dispatch({changes:{from:this.position, to:this.position + 1, insert:el.checked ? 'x' : ' '}, userEvent:'input'});
        view.focus();
      });
    }
    return slot;
  }
  ignoreEvent() { return true; }
}

function listItem(text) {
  const m = /^(\s*)([-+*]|\d+[.)]) (?:\[([ xX])\] )?(.*)$/.exec(text);
  return m && {indent:m[1], marker:m[2], task:m[3] !== undefined, checked:/x/i.test(m[3] || ''), body:m[4], prefix:text.length-m[4].length};
}

function marks(state) {
  const text = state.doc.toString(), ranges = [], hidden = [];
  const hide = (from, to, widget) => {
    if (to <= from || text.slice(from,to).includes('\n')) return;
    // Selected source is exposed so cut/copy and edits across Markdown boundaries stay predictable.
    if (state.selection.ranges.some(r => !r.empty && r.from < to && r.to > from)) return;
    if (hidden.some(r => r.from < to && r.to > from)) return;
    hidden.push({from,to}); ranges.push(Decoration.replace(widget ? {widget} : {}).range(from,to));
  };
  const styled = {StrongEmphasis:'mpv-bold', Emphasis:'mpv-italic', Strikethrough:'mpv-strike', InlineCode:'mpv-code', Link:'mpv-link'};
  markdown.parse(text).iterate({enter(node) {
    const {name, from, to} = node;
    if (name === 'FencedCode' || name === 'CodeBlock') return false;
    if (styled[name]) ranges.push(Decoration.mark({class:styled[name]}).range(from,to));
    if (/^(EmphasisMark|StrikethroughMark|CodeMark)$/.test(name)) hide(from,to);
    if (name === 'ListMark') {
      const line = state.doc.lineAt(from), item = listItem(line.text);
      if (!item) return;
      const depth = item.indent.replace(/\t/g,'    ').length;
      // Match the rendered list's native marker rail (about 1.9em at 14px).
      const markerWidth = item.task ? 1.9 : Math.max(1.9, item.marker.length * .65 + .5);
      ranges.push(Decoration.line({attributes:{class:'mpv-list-line'+(item.task && item.checked ? ' ps-md-task-done-text' : ''), style:`--mpv-indent:${depth * .6}em;--mpv-marker-width:${markerWidth}em`}}).range(line.from));
      hide(line.from, line.from + item.prefix, new Marker(/^\d/.test(item.marker) ? item.marker : '•', item.task ? item.checked : null, line.from+item.indent.length+item.marker.length+2));
    }
    if (/^ATXHeading\d$/.test(name)) ranges.push(Decoration.line({attributes:{class:'mpv-heading'}}).range(state.doc.lineAt(from).from));
    if (name === 'HeaderMark') hide(from, Math.min(state.doc.length,to+1));
    if (name === 'QuoteMark') {
      ranges.push(Decoration.line({attributes:{class:'mpv-quote'}}).range(state.doc.lineAt(from).from));
      hide(from, Math.min(state.doc.length,to+1));
    }
  }});
  return Decoration.set(ranges,true);
}

const richMarks = StateField.define({
  create: marks,
  update(value,tr) { return tr.docChanged || tr.selection ? marks(tr.state) : value; },
  provide: field => [EditorView.decorations.from(field), EditorView.atomicRanges.of(view => view.state.field(field).update({filter:(from,to,value)=>from<to && !value.spec.class}))],
});

function enter(view, soft = false) {
  const sel=view.state.selection.main, line=view.state.doc.lineAt(sel.from), n=listItem(line.text);
  if (!n) return false;
  let from=sel.from, to=sel.to, insert;
  if (soft) insert='\n'+n.indent+' '.repeat(n.marker.length+1);
  else if (!n.body.trim()) { from=line.from; to=line.to; insert=n.indent.length ? n.indent.replace(/( {1,2}|\t)$/,'')+n.marker+' '+(n.task?'[ ] ':'') : ''; }
  else { const ordered=/^(\d+)([.)])$/.exec(n.marker); insert='\n'+n.indent+(ordered?`${Number(ordered[1])+1}${ordered[2]}`:n.marker)+' '+(n.task?'[ ] ':''); }
  view.dispatch({changes:{from,to,insert},selection:{anchor:from+insert.length},userEvent:'input',scrollIntoView:true});
  return true;
}
function indent(view,out=false) {
  const changes=indentChanges(view.state.doc,view.state.selection.main,out);
  if(changes===null)return false;
  if(changes.length)view.dispatch({changes,userEvent:'input.indent',scrollIntoView:true});
  return true;
}
function format(view, delimiter) {
  const {from,to}=view.state.selection.main, doc=view.state.doc, length=delimiter.length;
  if(from>=length && doc.sliceString(from-length,from)===delimiter && doc.sliceString(to,to+length)===delimiter) {
    view.dispatch({changes:[{from:from-length,to:from},{from:to,to:to+length}],selection:{anchor:from-length,head:to-length},userEvent:'input'});
  } else view.dispatch({changes:{from,to,insert:delimiter+doc.sliceString(from,to)+delimiter},selection:{anchor:from+length,head:to+length},userEvent:'input'});
  return true;
}

function createCompletionOverlay(view, options) {
  const doc = view.dom.ownerDocument;
  const popup = doc.createElement('div');
  popup.className = 'mpv-completion';
  popup.setAttribute('role', 'listbox');
  popup.hidden = true;
  (doc.body || doc.documentElement).appendChild(popup);
  let items = [];
  let selected = 0;
  let replaceFrom = 0;
  let replaceTo = 0;
  let kind = 'value';
  let generation = 0;

  const close = () => { generation++; popup.hidden = true; items = []; };
  const isOpen = () => !popup.hidden && items.length > 0;
  const position = () => {
    if(popup.hidden)return;
    const anchor = kind === 'link' ? view.coordsAtPos(view.state.selection.main.head) : view.dom.getBoundingClientRect();
    if (!anchor) return;
    const width = kind === 'link' ? Math.min(420, doc.defaultView.innerWidth - 16) : Math.min(anchor.width, doc.defaultView.innerWidth - 16);
    popup.style.width = kind === 'link' ? '' : `${width}px`;
    popup.style.left = `${Math.max(8, Math.min(anchor.left, doc.defaultView.innerWidth - width - 8))}px`;
    popup.style.top = `${anchor.bottom + 4}px`;
  };
  const accept = (item) => {
    if (!item) return false;
    view.dispatch({ changes: { from: replaceFrom, to: replaceTo, insert: item.insert },
      selection: { anchor: replaceFrom + item.insert.length }, userEvent: 'input.complete' });
    close();
    view.focus();
    return true;
  };
  const render = (nextItems, from, to) => {
    items = nextItems.slice(0, 12); replaceFrom = from; replaceTo = to; selected = 0;
    popup.replaceChildren(...items.map((item, index) => {
      const row = doc.createElement('div');
      row.className = 'mpv-completion-item';
      row.setAttribute('role', 'option');
      const label=doc.createElement('div');label.className='mpv-completion-label';label.textContent=item.label;row.appendChild(label);
      if(item.detail){const detail=doc.createElement('div');detail.className='mpv-completion-detail';detail.textContent=item.detail;row.appendChild(detail);}
      row.addEventListener('mousedown', event => { event.preventDefault(); accept(item); });
      row.addEventListener('mouseenter', () => { selected = index; paint(); });
      return row;
    }));
    popup.hidden = items.length === 0;
    if (!popup.hidden) { paint(); position(); }
  };
  const paint = () => [...popup.children].forEach((el, index) => el.classList.toggle('is-selected', index === selected));
  const refresh = () => {
    const current=++generation;
    const cursor = view.state.selection.main.head;
    const before = view.state.doc.sliceString(0, cursor);
    const link = /(?:^|\s)(\[\[[^\]\n]*)$/.exec(before);
    if (link) {
      kind = 'link';
      const query = link[1].slice(2).toLowerCase();
      const start = cursor - link[1].length;
      popup.hidden=true;items=[];
      Promise.resolve(options.getLinkSuggestions?.(query) || []).then(suggestions=>{
        if(current===generation && view.hasFocus)render(suggestions,start,cursor);
      }).catch(error=>{console.warn('[yaml-ext] link suggestions',error);if(current===generation)close();});
      return;
    }
    if (options.showValueSuggestions && view.state.doc.lines === 1 && view.hasFocus) {
      kind = 'value';
      const line = view.state.doc.toString();
      const query = line.trim().toLowerCase();
      const start = 0;
      const suggestions = (options.getValueSuggestions?.(query) || []).map(value => ({ label: value, insert: value }));
      render(suggestions, start, line.length);
      return;
    }
    close();
  };
  const keydown = (event) => {
    if (!isOpen()) return false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopPropagation();
      selected = (selected + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; paint(); return true;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault(); event.stopPropagation(); return accept(items[selected]);
    }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return true; }
    return false;
  };
  view.scrollDOM.addEventListener('scroll', position);
  doc.defaultView.addEventListener('resize', position);
  return { refresh, keydown, isOpen, destroy: () => { view.scrollDOM.removeEventListener('scroll', position); doc.defaultView.removeEventListener('resize', position); popup.remove(); }, close };
}
function createMarkdownEditor(parent, source, options) {
  options = options || {};
  let completion;
  const extensions = [
    history(), richMarks,
    // Geometry belongs to the editor, independently of its consumer's wrapper.
    EditorView.baseTheme({
      '.cm-content .cm-line.mpv-list-line': {
        paddingLeft:'calc(var(--mpv-padding-left, 0px) + var(--mpv-indent) + var(--mpv-marker-width))',
        textIndent:'calc(-1 * var(--mpv-marker-width))'
      },
      '.mpv-marker': {display:'inline-block', width:'var(--mpv-marker-width, 1.9em)', textIndent:'0', color:'var(--text-muted)', textAlign:'center'}
    }),
    options.lineWrapping === false ? [] : EditorView.lineWrapping,
    EditorView.contentAttributes.of({'aria-label':options.label || 'Markdown', 'aria-multiline':'true', spellcheck:'true'}),
    Prec.high(keymap.of([
      {key:'ArrowDown',run:()=>completion?.keydown({key:'ArrowDown',preventDefault(){},stopPropagation(){}}) || false},
      {key:'ArrowUp',run:()=>completion?.keydown({key:'ArrowUp',preventDefault(){},stopPropagation(){}}) || false},
      {key:'Enter',run:()=>completion?.isOpen() ? completion.keydown({key:'Enter',preventDefault(){},stopPropagation(){}}) : false},
      {key:'Tab',run:()=>completion?.isOpen() ? completion.keydown({key:'Tab',preventDefault(){},stopPropagation(){}}) : false},
      {key:'Escape',run:()=>completion?.isOpen() ? completion.keydown({key:'Escape',preventDefault(){},stopPropagation(){}}) : false},
    ])),
    keymap.of([{key:'Enter',run:v=>enter(v)}, {key:'Shift-Enter',run:v=>enter(v,true)},
      {key:'Tab',run:v=>indent(v)}, {key:'Shift-Tab',run:v=>indent(v,true)},
      {key:'Mod-b',run:v=>format(v,'**')}, {key:'Mod-i',run:v=>format(v,'*')},
      ...historyKeymap, ...defaultKeymap]),
    EditorView.updateListener.of(u=>{if(u.docChanged)options.onChange(u.state.doc.toString()); if (completion && (u.docChanged || u.selectionSet)) completion.refresh();}),
    EditorView.domEventHandlers({
      keydown:(event)=>completion?.keydown(event) || options.onKeyDown?.(event) || false,
      blur:()=>{completion?.close(); options.onBlur?.();},
      focus:()=>{options.onFocus?.(); completion?.refresh();}
    }),
    ...(options.extensions || []),
  ];
  const editor = new EditorView({parent, state:EditorState.create({
    doc:source || '',
    selection:options.selection,
    extensions:extensions.flat(),
  })});
  completion = createCompletionOverlay(editor, options);
  editor.completion = completion;
  completion.refresh();
  const destroy = editor.destroy.bind(editor);
  editor.destroy = () => { completion.destroy(); destroy(); };
  return editor;
}
module.exports={createMarkdownEditor, format, undo, redo, listItem};
