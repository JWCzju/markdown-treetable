const {Component,MarkdownRenderer}=require('obsidian');
const {lookupRule,rowLookup}=require('./lookup-model.cjs');
class TableLookup {
  constructor(plugin) {
    this.plugin=plugin;this.records=new Map();this.widthSamples=new WeakMap();this.hints=new Set();this.dead=false;
    for(const event of ['changed','resolved'])plugin.registerEvent(plugin.app.metadataCache.on(event,()=>plugin.schedule()));
    for(const event of ['delete','rename'])plugin.registerEvent(plugin.app.vault.on(event,()=>plugin.schedule()));
    // Remove the display before native cell editing reads or focuses its DOM.
    plugin.registerDomEvent(document,'pointerdown',e=>{
      const cell=e.target.closest?.('td');const r=this.records.get(cell);
      if(r)this.remove(cell);
    },true);
    plugin.registerDomEvent(document,'focusin',()=>plugin.schedule(),true);
    plugin.registerDomEvent(document,'focusout',()=>plugin.schedule(),true);
    plugin.register(()=>this.destroy());
  }
  remove(cell) {
    const r=this.records.get(cell);if(!r)return;
    r.cancelled=true;r.component.unload();r.el.remove();
    if(cell.getAttribute('title')===r.title) {
      if(r.oldTitle===null)cell.removeAttribute('title');else cell.setAttribute('title',r.oldTitle);
    }
    this.records.delete(cell);
  }
  prune() {
    for(const [cell,r] of this.records)if(!cell.isConnected||!r.el.isConnected)this.remove(cell);
    for(const cell of this.hints)if(!cell.isConnected)this.hints.delete(cell);
  }
  apply(element,table) {
    if(this.dead)return;
    this.prune();
    const rules=table?.valid?table.headers.map(lookupRule):[];
    const samples=[];this.widthSamples.set(element,samples);
    const rows=[...element.querySelectorAll(':scope > tbody > tr')];
    if(table?.valid&&rows.length!==table.rows.length) {
      for(const cell of this.records.keys())if(element.contains(cell))this.remove(cell);
      return;
    }
    for(let ri=0;ri<rows.length;ri++)for(let ci=0;ci<rows[ri].cells.length;ci++) {
      const cell=rows[ri].cells[ci],rule=rules[ci];
      const query=rule&&rowLookup(table.rows[ri],ci,rule,table.headers.length);
      const editing=cell.contains(cell.ownerDocument.activeElement)||cell.querySelector('.cm-editor,[contenteditable="true"]');
      cell.toggleAttribute('data-mte-lookup-editing',!!query&&!!editing);
      if(query&&editing)this.hints.add(cell);else this.hints.delete(cell);
      if(!query){this.remove(cell);continue;}
      const app=this.plugin.app;
      const file=query.target?app.metadataCache.getFirstLinkpathDest(query.target,table.path):null;
      const fm=file?app.metadataCache.getFileCache(file)?.frontmatter:null;
      const present=fm&&Object.prototype.hasOwnProperty.call(fm,query.property);
      const value=present?fm[query.property]:null;
      const error=query.error||(!file?`未找到笔记：${query.target}`:!present?`未找到属性：${query.property}`:null);
      const missingProperty=!query.error&&!!file&&!present;
      samples.push({index:ci,text:(missingProperty?'-':error)|| ((value===null||value==='')?'-':typeof value==='object'?JSON.stringify(value):String(value))});
      if(editing){this.remove(cell);continue;}
      const signature=JSON.stringify([query,file?.path,value,error]);
      if(this.records.get(cell)?.signature===signature)continue;
      this.remove(cell);
      const el=cell.ownerDocument.createElement('div');el.className='mte-lookup-value markdown-rendered';el.contentEditable='false';
      const title=error||`自动引用：${file.basename} · ${query.property}。输入内容可覆盖；清空后恢复自动引用。`;
      const record={el,component:new Component(),signature,cancelled:false,title,oldTitle:cell.getAttribute('title')};
      record.component.load();this.records.set(cell,record);cell.setAttribute('title',title);cell.append(el);
      void this.render(record,value,error,file?.path||table.path,missingProperty);
    }
    // Reading tables have no editor scan to refresh their measured width.
    const widths=this.plugin.columnWidths;
    const record=widths?.records.get(element);
    if(record)widths.apply(element,record.descriptor,record.commit);
  }
  async render(r,value,error,path,missingProperty=false) {
    try {
      if(error||value===null||value==='') {r.el.textContent=missingProperty?'-':error||'-';r.el.classList.add('mte-lookup-placeholder');}
      else if(typeof value==='object'&&!Array.isArray(value)) {
        const pre=r.el.ownerDocument.createElement('pre');pre.textContent=JSON.stringify(value,null,2);r.el.append(pre);
      } else {
        const text=Array.isArray(value)?value.map(v=>'- '+(typeof v==='object'?JSON.stringify(v):String(v))).join('\n'):String(value);
        await MarkdownRenderer.render(this.plugin.app,text,r.el,path,r.component);
      }
      if(r.cancelled)r.el.remove();
    } catch(error) {
      if(!r.cancelled)r.el.textContent='属性显示失败';
      console.error('[my-table-extended] lookup rendering failed',error);
    }
  }
  destroy(){this.dead=true;for(const cell of this.hints)cell.removeAttribute('data-mte-lookup-editing');for(const cell of [...this.records.keys()])this.remove(cell);}
}
module.exports={TableLookup};
