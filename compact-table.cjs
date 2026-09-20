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
      // A summary is a projection, so its character coordinates are not editor offsets.
      table.addEventListener('mousedown',r.down=e=>{
        if(e.button!==0 || !e.target.closest('.mte-compact-summary') || e.target.closest('input,button,a'))return;
        r.activate=e.target.closest('td,th');e.preventDefault();
      },true);
      table.addEventListener('click',r.click=e=>{
        if(r.activate && r.view){
          const cell=r.activate;r.activate=null;
          requestAnimationFrame(()=>{
            const cm=(r.view.currentMode||r.view.editMode)?.tableCell?.editor?.cm;
            if(cm && cell.contains(cm.dom)){cm.dispatch({selection:{anchor:cm.state.doc.length}});cm.focus();}
          });
        }
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
    const measurements=[];
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
      const text=first, more=lines.length>1;
      if(summary.dataset.text!==text || summary.dataset.more!==String(more)){
        summary.dataset.text=text;summary.dataset.more=String(more);summary.replaceChildren();
        const label=document.createElement('span');label.className='mte-summary-text';label.textContent=text;summary.append(label);
        const ellipsis=document.createElement('span');ellipsis.className='mte-summary-ellipsis';ellipsis.textContent=' …';ellipsis.setAttribute('aria-label','还有内容，点击展开');summary.append(ellipsis);
      }
      // Keep standalone tasks actionable even in the compact projection.
      const box=body.querySelector('input[type=checkbox]');
      if(box && /^\s*[☐☑]\s*$/.test(text)){
        let proxy=summary.querySelector('input');
        if(!proxy){proxy=box.cloneNode();proxy.addEventListener('mousedown',e=>{e.preventDefault();e.stopPropagation();});proxy.addEventListener('click',e=>{e.stopPropagation();box.click();});summary.replaceChildren(proxy);}
        proxy.checked=box.checked;
      }
      const label=summary.querySelector('.mte-summary-text');
      if(label)measurements.push({summary,label,more});
    }
    // Finish every DOM write before reading geometry. Alternating writes and
    // reads per cell forces a full table layout once for every cell.
    const overflow=measurements.map(({summary,label,more})=>({summary,
      value:label.scrollWidth > (more ? label.clientWidth : summary.clientWidth)+1}));
    for(const {summary,value} of overflow)summary.classList.toggle('mte-summary-overflow',value);
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
  clean(table){const r=this.records.get(table);r?.caption?.remove();if(r){table.removeEventListener('click',r.click);table.removeEventListener('mousedown',r.down,true);}table.classList.remove('mte-compact');table.querySelectorAll('.mte-compact-summary').forEach(e=>e.remove());table.querySelectorAll('.mte-compact-body').forEach(e=>e.replaceWith(...e.childNodes));table.querySelectorAll('.mte-compact-open').forEach(e=>e.classList.remove('mte-compact-open'));this.records.delete(table);}
  prune(){for(const [t]of this.records)if(!t.isConnected)this.clean(t);}
  destroy(){for(const [t]of this.records)this.clean(t);}
}
module.exports={CompactTable};
