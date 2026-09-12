const { WIDTH,clamp,tables,setWidths }=require('./widths.cjs');
class ColumnWidths {
  constructor(plugin){
    this.plugin=plugin;this.records=new Map();
    // Mutation callbacks run before paint, unlike the host scanner's debounce.
    this.observer=new MutationObserver(()=>{
      this.observer.disconnect();
      try { for(const leaf of plugin.app.workspace.getLeavesOfType('markdown'))this.scan(leaf.view); }
      finally { if(!this.dead)this.observe(); }
    });
    this.observe();
    this.resize=new ResizeObserver(entries=>{for(const entry of entries){const r=this.records.get(entry.target);if(r)this.sizeGrips(r);}});
    this.style=document.createElement('style');this.style.textContent=`
    .mte-width-scroll {overflow-x:auto!important;overflow-y:hidden!important;max-width:100%!important;padding-bottom:6px;}
    .cm-table-widget.mte-width-scroll > .table-wrapper {overflow:visible!important;}
    table.mte-width-table {display:table!important;table-layout:fixed!important;min-width:0!important;max-width:none!important;}
    table.mte-width-table :is(th,td) {box-sizing:border-box!important;min-width:0!important;max-width:none!important;overflow-wrap:anywhere!important;word-break:normal!important;white-space:normal!important;}
    table.mte-width-table .table-cell-wrapper {min-width:0!important;max-width:100%!important;overflow-wrap:anywhere!important;}
    table.mte-width-table img {max-width:100%!important;height:auto;}
    table.mte-width-table pre {max-width:100%;overflow-x:auto;white-space:pre;}
    table.mte-width-table th {position:relative;}
    .mte-width-grip {position:absolute;top:0;right:-4px;width:8px;cursor:col-resize;z-index:20;touch-action:none;border:0!important;background:transparent!important;padding:0!important;box-shadow:none!important;border-radius:0!important;}
    .mte-width-grip::after {content:"";position:absolute;left:3px;top:0;bottom:0;width:1px;background:transparent;}
    .mte-width-grip:hover::after,.mte-width-grip:focus-visible::after,.mte-width-grip.is-dragging::after {background:var(--interactive-accent);}
    `;document.head.append(this.style);
    plugin.registerMarkdownPostProcessor((el,ctx)=>this.reading(el,ctx));
  }
  observe(){this.observer.observe(document.body,{childList:true,subtree:true});}
  sizeGrips(record){const h=record.table.offsetHeight;for(const grip of record.table.querySelectorAll('.mte-width-grip'))if(grip.style.height!==`${h}px`)grip.style.height=`${h}px`;}
  apply(table,descriptor,commit){
    let record=this.records.get(table);
    if(record?.dragging)return;
    const headers=[...table.querySelectorAll('thead tr:first-child > th')];
    if(headers.length!==descriptor.cells.length)return;
    const explicit=descriptor.cells.some(c=>WIDTH.test(c.text));
    const widths=descriptor.cells.map((c,i)=>{const m=c.text.match(WIDTH);return m?clamp(+m[1]):clamp(record?.widths[i]||headers[i].getBoundingClientRect().width||180);});
    if(!record){
      record={table,originalStyle:table.getAttribute('style'),widths,descriptor,commit};this.records.set(table,record);
      const parent=table.closest('.cm-table-widget') || table.parentElement;record.parent=parent;record.hadScroll=parent.classList.contains('mte-width-scroll');parent.classList.add('mte-width-scroll');
      headers.forEach((th,index)=>{const grip=document.createElement('div');grip.className='mte-width-grip';grip.tabIndex=0;grip.setAttribute('role','separator');grip.setAttribute('aria-orientation','vertical');grip.setAttribute('aria-label',`调整第 ${index+1} 列宽度`);grip.title='拖动调整列宽；方向键每次 10px';
      grip.addEventListener('pointerdown',e=>this.start(e,record,index));
      for(const type of ['mousedown','click','dblclick'])grip.addEventListener(type,e=>{e.preventDefault();e.stopPropagation();});
      grip.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();e.stopPropagation();const next=[...record.widths];next[index]=clamp(next[index]+(e.key==='ArrowLeft'?-10:10));record.commit(next);});th.append(grip);});this.resize.observe(table);
    }
    Object.assign(record,{descriptor,commit,widths});
    if(explicit)this.layout(record,widths);
    this.sizeGrips(record);
  }
  layout(record,widths){
    const table=record.table;table.classList.add('mte-width-table');
    table.style.setProperty('table-layout','fixed','important');table.style.setProperty('min-width','0','important');table.style.setProperty('display','table','important');
    table.style.setProperty('width',`${widths.reduce((a,b)=>a+b,0)}px`,'important');
    let colgroup=table.querySelector(':scope > colgroup[data-mte-widths]');
    if(!colgroup){colgroup=document.createElement('colgroup');colgroup.dataset.mteWidths='';table.prepend(colgroup);}
    while(colgroup.children.length<widths.length)colgroup.append(document.createElement('col'));
    widths.forEach((w,i)=>colgroup.children[i].style.width=`${w}px`);
    record.widths=widths;
  }
  start(event,record,index){
    if(event.button!==0)return;event.preventDefault();event.stopImmediatePropagation();
    const target=event.currentTarget;const initial=[...record.widths],x=event.clientX;let next=initial;
    record.dragging=true;target.classList.add('is-dragging');target.setPointerCapture(event.pointerId);
    const move=e=>{next=[...initial];next[index]=clamp(initial[index]+e.clientX-x);this.layout(record,next);this.sizeGrips(record);};
    const finish=e=>{target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',finish);target.removeEventListener('pointercancel',finish);record.dragging=false;target.classList.remove('is-dragging');
      if(e.type==='pointercancel')this.layout(record,initial);else if(next[index]!==initial[index])record.commit(next);
    };
    target.addEventListener('pointermove',move);target.addEventListener('pointerup',finish);target.addEventListener('pointercancel',finish);
  }
  scan(view){
    for(const [table] of this.records)if(!table.isConnected){this.resize.unobserve(table);this.records.delete(table);}
    const cm=view.editor?.cm;if(!cm)return;
    const descriptors=tables(cm.state.doc.toString());
    for(const table of view.containerEl.querySelectorAll('table.table-editor'))try{
      const line=cm.state.doc.lineAt(cm.posAtDOM(table)).number-1;
      const descriptor=descriptors.find(d=>d.line===line);if(!descriptor)continue;
      this.apply(table,descriptor,widths=>{
        const current=cm.state.doc.line(descriptor.line+1);if(current.text!==descriptor.raw)return;
        cm.dispatch({changes:{from:current.from,to:current.to,insert:setWidths(current.text,widths)},userEvent:'input'});
        this.scan(view);
      });
    }catch(_){}
  }

  async reading(el,ctx){
    const file=this.plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);if(!file)return;
    const source=await this.plugin.app.vault.cachedRead(file);if(this.dead)return;
    const descriptors=tables(source);
    for(const table of el.querySelectorAll('table')){
      const info=ctx.getSectionInfo(table);const d=descriptors.find(d=>d.line===info?.lineStart);if(!d)continue;
      this.apply(table,d,async widths=>{await this.plugin.app.vault.process(file,text=>{const lines=text.split('\n');if(lines[d.line]!==d.raw)return text;lines[d.line]=setWidths(d.raw,widths);return lines.join('\n');});});
    }
  }
  destroy(){this.dead=true;this.observer.disconnect();this.resize.disconnect();this.style.remove();
    for(const [table,r]of this.records){table.classList.remove('mte-width-table');if(r.originalStyle===null)table.removeAttribute('style');else table.setAttribute('style',r.originalStyle);table.querySelectorAll('.mte-width-grip,colgroup[data-mte-widths]').forEach(e=>e.remove());if(!r.hadScroll)r.parent.classList.remove('mte-width-scroll');}
  }
}
module.exports={ColumnWidths};
