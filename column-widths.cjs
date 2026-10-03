const { WIDTH,clamp,tables,setWidths,cells }=require('./widths.cjs');
const widthMarkdown = new (require('markdown-it'))({html:true});
class ColumnWidths {
  constructor(plugin){
    this.plugin=plugin;this.records=new Map();this.autoWidths=new Map();
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
  sizeGrips(record){
    // The table box includes its toolbar caption; grips start below it in th.
    // Read all geometry before writing, and stop at the actual table bottom.
    const bottom=record.table.getBoundingClientRect().bottom;
    const sizes=[...record.table.querySelectorAll('.mte-width-grip')].map(grip=>[grip,Math.max(0,bottom-grip.getBoundingClientRect().top)]);
    for(const [grip,h] of sizes)if(grip.style.height!==`${h}px`)grip.style.height=`${h}px`;
  }
  apply(table,descriptor,commit){
    let record=this.records.get(table);
    if(record?.dragging)return;
    const headerRow=table.querySelector('thead > tr:not(.mte-column-groups)');
    const headers=[...(headerRow?.querySelectorAll(':scope > th') || [])];
    if(headers.length!==descriptor.cells.length)return;
    const auto=this.measure(table,descriptor);
    const widths=descriptor.cells.map((c,i)=>{const m=c.text.match(WIDTH);return m?clamp(+m[1]):auto[i];});
    if(!record){
      record={table,originalStyle:table.getAttribute('style'),widths,descriptor,commit};this.records.set(table,record);
      const parent=table.closest('.cm-table-widget') || table.parentElement;record.parent=parent;record.hadScroll=parent.classList.contains('mte-width-scroll');parent.classList.add('mte-width-scroll');
      headers.forEach((th,index)=>{const grip=document.createElement('div');grip.className='mte-width-grip';grip.tabIndex=0;grip.setAttribute('role','separator');grip.setAttribute('aria-orientation','vertical');grip.setAttribute('aria-label',`调整第 ${index+1} 列宽度`);grip.title='拖动调整列宽；方向键每次 10px';
      grip.addEventListener('pointerdown',e=>this.start(e,record,index));
      for(const type of ['mousedown','click','dblclick'])grip.addEventListener(type,e=>{e.preventDefault();e.stopPropagation();});
      grip.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();e.stopPropagation();const next=[...record.widths];next[index]=clamp(next[index]+(e.key==='ArrowLeft'?-10:10));record.commit(next,index);});th.append(grip);});this.resize.observe(table);
    }
    Object.assign(record,{descriptor,commit,widths});
    this.layout(record,widths);
    this.sizeGrips(record);
  }
  measure(table,descriptor){
    const max=this.plugin.autoColumnMaxWidth;
    const lookupSamples=this.plugin.tableLookup?.widthSamples.get(table)||[];
    const key=JSON.stringify(lookupSamples)+':'+max+':'+descriptor.source.replace(/<!--\s*width\s*=\s*\d+\s*-->/g,'');
    const cached=this.autoWidths.get(key);if(cached)return cached;
    const tree=require('./model.cjs').parse(descriptor.source,'',{autoDetect:this.plugin.autoDetectTree})[0];
    const inset=tree ? 44+(tree.rows.some(r=>r.group)?24:0)+Math.max(0,...tree.rows.map(r=>r.depth||0))*22 : 0;
    // Measure unconstrained rendered content offscreen, with one batched layout.
    // This remains independent of compact mode and previously dragged widths.
    const host=document.createElement('div');host.className='mte-width-measure';
    host.style.cssText='position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;contain:layout style;';
    host.style.font=getComputedStyle(table).font;
    const probes=[];
    const lines=descriptor.source.split('\n');
    for(let row=0;row<lines.length;row++){
      if(row===1)continue;
      for(const [index,cell] of cells(lines[row]).entries()){
        if(index>=descriptor.cells.length)continue;
        const probe=document.createElement('div');
        // Native cells retain a hidden, stale preview while their editor owns
        // the new text. Source is authoritative for both cache and measurement.
        const rendered=widthMarkdown.renderInline(cell.text.replace(WIDTH,''));
        const parsed=new DOMParser().parseFromString(rendered,'text/html');
        parsed.querySelectorAll('script,style,iframe,object,embed,link').forEach(n=>n.remove());
        for(const n of parsed.body.childNodes)probe.append(n.cloneNode(true));
        probe.querySelectorAll('img').forEach(n=>n.replaceWith('[图片]'));
        probe.style.cssText='width:max-content;max-width:none;white-space:nowrap;';
        host.append(probe);probes.push({probe,index});
      }
    }
    // Empty-source lookup cells still contribute their generated content width.
    for(const sample of lookupSamples) {
      const probe=document.createElement('div');probe.textContent=sample.text;
      probe.style.cssText='width:max-content;max-width:none;white-space:nowrap;';
      host.append(probe);probes.push({probe,index:sample.index});
    }
    table.ownerDocument.body.append(host);
    const widths=descriptor.cells.map(()=>60);
    for(const {probe,index}of probes)widths[index]=Math.min(max,Math.max(widths[index],Math.ceil(probe.getBoundingClientRect().width)+28+(tree?.col===index?inset:0)));
    host.remove();
    if(this.autoWidths.size>100)this.autoWidths.clear();
    this.autoWidths.set(key,widths);return widths;
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
      if(e.type==='pointercancel')this.layout(record,initial);else if(next[index]!==initial[index])record.commit(next,index);
    };
    target.addEventListener('pointermove',move);target.addEventListener('pointerup',finish);target.addEventListener('pointercancel',finish);
  }
  scan(view){
    for(const [table] of this.records)if(!table.isConnected){this.resize.unobserve(table);this.records.delete(table);}
    const cm=view.editor?.cm;if(!cm)return;
    const source=cm.state.doc.toString();
    const descriptors=tables(source);
    let models;
    for(const table of view.containerEl.querySelectorAll('table.table-editor'))try{
      const line=cm.state.doc.lineAt(cm.posAtDOM(table)).number-1;
      const descriptor=descriptors.find(d=>d.line===line);if(!descriptor)continue;
      this.apply(table,descriptor,(widths,index)=>{
        const current=cm.state.doc.line(descriptor.line+1);if(current.text!==descriptor.raw)return;
        cm.dispatch({changes:{from:current.from,to:current.to,insert:setWidths(current.text,widths.map((w,i)=>i===index?w:null))},userEvent:'input'});
        this.scan(view);
      });
      // Native header writeback replaces the whole table. Mount presentation
      // in this pre-paint observer pass, not after the 40ms general debounce.
      if(this.plugin.compactTable && !this.plugin.compactTable.records.has(table)){
        models ||= this.plugin.memoryTables(source,view.file.path,true);
        this.plugin.compactTable.apply(table,models.find(t=>t.start===line));
      }
    }catch(_){}
  }

  async reading(el,ctx){
    const file=this.plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);if(!file)return;
    const source=await this.plugin.app.vault.cachedRead(file);if(this.dead)return;
    const descriptors=tables(source);
    for(const table of el.querySelectorAll('table')){
      const info=ctx.getSectionInfo(table);const d=descriptors.find(d=>d.line===info?.lineStart);if(!d)continue;
      this.apply(table,d,async (widths,index)=>{await this.plugin.app.vault.process(file,text=>{const lines=text.split('\n');if(lines[d.line]!==d.raw)return text;lines[d.line]=setWidths(d.raw,widths.map((w,i)=>i===index?w:null));return lines.join('\n');});});
    }
  }
  destroy(){this.dead=true;this.observer.disconnect();this.resize.disconnect();this.style.remove();
    for(const [table,r]of this.records){table.classList.remove('mte-width-table');if(r.originalStyle===null)table.removeAttribute('style');else table.setAttribute('style',r.originalStyle);table.querySelectorAll('.mte-width-grip,colgroup[data-mte-widths]').forEach(e=>e.remove());if(!r.hadScroll)r.parent.classList.remove('mte-width-scroll');}
  }
}
module.exports={ColumnWidths};
