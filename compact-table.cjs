const {setIcon} = require('obsidian');
const {isolateHistory} = require('@codemirror/commands');
const {heightChange} = require('./row-height.cjs');
class CompactTable {
  constructor(plugin) { this.plugin = plugin; this.records = new Map(); }
  apply(table, model) {
    let r = this.records.get(table);
    if (!model?.valid) { if(r) this.clean(table); return; }
    const view = this.plugin.app.workspace.getLeavesOfType('markdown').map(l=>l.view)
      .find(v=>v.file?.path===model.path && v.containerEl.contains(table) && v.getMode?.()==='source' && table.classList.contains('table-editor'));
    if (!r) {
      r = {model, view}; this.records.set(table,r);
      if (view) {
        const caption=document.createElement('caption');caption.className='mte-table-tools';
        const button=document.createElement('button');button.type='button';button.className='mte-height-toggle';
        setIcon(button,'rows-3');caption.append(button);table.prepend(caption);r.caption=caption;r.button=button;
        for(const type of ['pointerdown','mousedown'])button.addEventListener(type,e=>{e.preventDefault();e.stopPropagation();});
        button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();this.toggle(table);});
      }
      table.addEventListener('click',r.click=e=>{
        if(view || e.target.closest('button,a,input'))return;
        const cell=e.target.closest('td,th');if(!cell)return;
        table.querySelectorAll('.mte-compact-open').forEach(c=>{if(c!==cell)c.classList.remove('mte-compact-open');});
        cell.classList.toggle('mte-compact-open');
      });
    }
    r.model=model;r.view=view;
    table.classList.toggle('mte-compact',model.singleLine);
    if(r.button){r.button.setAttribute('aria-pressed',String(model.singleLine));r.button.setAttribute('aria-label','单行展示');r.button.title=model.singleLine?'单行展示：已开启（点击恢复自动行高）':'单行展示：已关闭';}
    if(!model.singleLine){table.querySelectorAll('.mte-compact-summary').forEach(e=>e.remove());return;}
    for(const cell of table.querySelectorAll(':scope > tbody > tr > td, :scope > thead > tr > th')){
      const wrapper=cell.querySelector(':scope > .table-cell-wrapper');
      // Reading-mode cells have no native wrapper. Preserve original nodes.
      let body=wrapper || cell.querySelector(':scope > .mte-compact-body');
      if(!body){body=document.createElement('span');body.className='mte-compact-body';for(const n of [...cell.childNodes])if(!n.classList?.contains('mte-toggle')&&!n.classList?.contains('mte-width-grip'))body.append(n);cell.prepend(body);}
      if(body.querySelector('.cm-editor'))continue;
      let summary=cell.querySelector(':scope > .mte-compact-summary');
      if(!summary){summary=document.createElement('span');summary.className='mte-compact-summary';cell.append(summary);}
      const clone=body.cloneNode(true);
      clone.querySelectorAll('button,.mte-prefix,.mte-group-prefix,.mte-outline-marker').forEach(n=>n.remove());
      clone.querySelectorAll('br').forEach(n=>n.replaceWith('\n'));
      clone.querySelectorAll('.mte-outline-preview-line').forEach(n=>n.append('\n'));
      clone.querySelectorAll('img').forEach(n=>n.replaceWith('[图片]'));
      clone.querySelectorAll('input[type=checkbox]').forEach(n=>n.replaceWith(n.checked?'☑ ':'☐ '));
      const lines=clone.textContent.split('\n').map(s=>s.trim()).filter(Boolean);
      let first=lines[0]||'';
      const row=model.rows[cell.parentElement.sectionRowIndex];
      if(cell.parentElement.parentElement.tagName==='TBODY' && cell.cellIndex===model.col && row?.prefix && first.startsWith(row.prefix))first=first.slice(row.prefix.length);
      first=first.replace(/^[-*+] \[([ xX])\] /,(_,x)=>x===' '?'☐ ':'☑ ').replace(/^[-*+] /,'');
      const text=first+(lines.length>1?'…':'');
      if(summary.textContent!==text)summary.textContent=text;
    }
  }
  toggle(table){
    const r=this.records.get(table),v=r?.view,cm=v?.editor?.cm;
    if(!cm||this.plugin.composing)return;
    // Resolve the current source position at click time, never retain offsets
    // across edits above this table.
    let start;try{start=cm.state.doc.lineAt(cm.posAtDOM(table)).number-1;}catch{return;}
    const source=cm.state.doc.toString();
    const model=this.plugin.memoryTables(source,v.file.path).find(t=>t.start===start);
    if(!model)return;
    cm.dispatch({changes:heightChange(source,start,!model.singleLine),annotations:isolateHistory.of('full'),userEvent:'input'});
    this.plugin.schedule();
  }
  clean(table){const r=this.records.get(table);r?.caption?.remove();if(r)table.removeEventListener('click',r.click);table.classList.remove('mte-compact');table.querySelectorAll('.mte-compact-summary').forEach(e=>e.remove());table.querySelectorAll('.mte-compact-body').forEach(e=>e.replaceWith(...e.childNodes));table.querySelectorAll('.mte-compact-open').forEach(e=>e.classList.remove('mte-compact-open'));this.records.delete(table);}
  prune(){for(const [t]of this.records)if(!t.isConnected)this.clean(t);}
  destroy(){for(const [t]of this.records)this.clean(t);}
}
module.exports={CompactTable};
