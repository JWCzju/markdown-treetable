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
        const menuButton=document.createElement('button');menuButton.type='button';menuButton.className='mte-height-menu';
        setIcon(button,'rows-3');setIcon(menuButton,'chevron-down');caption.append(button,menuButton);table.prepend(caption);r.caption=caption;r.button=button;r.menuButton=menuButton;
        for(const control of [button,menuButton])for(const type of ['pointerdown','mousedown'])control.addEventListener(type,e=>{e.preventDefault();e.stopPropagation();});
        button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();this.toggle(table);});
        menuButton.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();this.showMenu(table);});
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
    table.classList.toggle('mte-compact',!!model.rowHeight);
    table.dataset.mteRowHeight=String(model.rowHeight || 0);
    if(r.button){r.button.setAttribute('aria-pressed',String(!!model.rowHeight));r.button.setAttribute('aria-label',model.rowHeight?'恢复默认行高':'切换为低行高');r.button.title=model.rowHeight?'行高：点击恢复默认':'行高：点击切换为低';}
    if(r.menuButton)r.menuButton.setAttribute('aria-label','选择行高');
    if(!model.rowHeight){table.querySelectorAll('.mte-compact-summary').forEach(e=>e.remove());return;}
    const measurements=[];
    for(const cell of table.querySelectorAll(':scope > tbody > tr > td, :scope > thead > tr > th')){
      const wrapper=cell.querySelector(':scope > .table-cell-wrapper');
      // Reading-mode cells have no native wrapper. Preserve original nodes.
      let body=wrapper || cell.querySelector(':scope > .mte-compact-body');
      if(!body){body=document.createElement('span');body.className='mte-compact-body';for(const n of [...cell.childNodes])if(!n.classList?.contains('mte-toggle')&&!n.classList?.contains('mte-width-grip'))body.append(n);cell.prepend(body);}
      if(body.querySelector('.cm-editor'))continue;
      let summary=cell.querySelector(':scope > .mte-compact-summary');
      if(!summary){summary=document.createElement('span');summary.className='mte-compact-summary';cell.append(summary);}
      // Clone rendered nodes so Markdown, task boxes and fold controls survive.
      const fragment=document.createElement('span');
      for(const child of body.childNodes)fragment.append(child.cloneNode(true));
      fragment.querySelectorAll('.mte-prefix,.mte-group-prefix,.mte-width-meta').forEach(n=>n.remove());
      fragment.querySelectorAll('.internal-embed.image-embed,img').forEach(n=>n.replaceWith('[图片]'));
      if(model.rowHeight===1)fragment.querySelectorAll('br').forEach(br=>br.replaceWith(' '));
      const originals=[...body.querySelectorAll('input[type=checkbox],.mte-cell-fold-hit,.mte-arrow-hit')];
      const signature=model.rowHeight+fragment.innerHTML+originals.map(n=>n.checked??'').join(',');
      if(summary._richSignature!==signature){
        summary._richSignature=signature;summary.replaceChildren();
        fragment.className='mte-summary-text';summary.append(fragment);
        const ellipsis=document.createElement('span');ellipsis.className='mte-summary-ellipsis';ellipsis.textContent=' …';ellipsis.setAttribute('aria-label','还有内容，点击展开');summary.append(ellipsis);
      }
      if(model.rowHeight!==1)summary.classList.remove('mte-summary-overflow');
      // Resolve controls against the current source nodes, including after a
      // native re-render with identical text. Cloned nodes have no listeners.
      const proxies=[...summary.querySelectorAll('input[type=checkbox],.mte-cell-fold-hit,.mte-arrow-hit')];
      proxies.forEach((proxy,i)=>{
        const original=originals[i];if(!original)return;
        if(proxy.matches('input')){
          proxy.checked=original.checked;
          proxy.onpointerdown=e=>e.stopPropagation();
          proxy.onmousedown=e=>{e.preventDefault();e.stopPropagation();};
          proxy.onclick=e=>{e.stopPropagation();original.click();};
        }else{
          const action=this.plugin.cellOutline.foldActions.get(original);
          if(action)this.plugin.cellOutline.foldActions.set(proxy,()=>{action();this.plugin.schedule();});
        }
      });
      const label=summary.querySelector('.mte-summary-text');
      if(label && model.rowHeight===1)measurements.push({summary,label});
    }
    // Finish every DOM write before reading geometry. Alternating writes and
    // reads per cell forces a full table layout once for every cell.
    const overflow=measurements.map(({summary,label})=>({summary,
      value:label.scrollWidth > summary.clientWidth+1}));
    for(const {summary,value} of overflow)summary.classList.toggle('mte-summary-overflow',value);
  }
  toggle(table){this.setHeight(table,this.records.get(table)?.model?.rowHeight ? 0 : 1);}
  showMenu(table){
    const r=this.records.get(table);if(!r?.menuButton)return;
    if(r.popup){this.closeMenu(r);return;}
    const popup=document.createElement('div');popup.className='mte-height-popover';popup.setAttribute('role','menu');
    for(const [height,label] of [[0,'默认'],[1,'低 · 1 行'],[2,'中 · 2 行'],[4,'高 · 4 行'],[6,'超高 · 6 行']]){
      const item=document.createElement('button');item.type='button';item.className='mte-height-option';item.setAttribute('role','menuitemradio');
      item.setAttribute('aria-checked',String(r.model.rowHeight===height));item.textContent=label;
      item.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();this.closeMenu(r);this.setHeight(table,height);});
      popup.append(item);
    }
    const rect=r.menuButton.getBoundingClientRect();
    popup.style.left=`${rect.left}px`;popup.style.top=`${rect.bottom+4}px`;
    document.body.append(popup);r.popup=popup;
    r.dismiss=e=>{if(!popup.contains(e.target)&&e.target!==r.menuButton)this.closeMenu(r);};
    r.escape=e=>{if(e.key==='Escape')this.closeMenu(r);};
    document.addEventListener('pointerdown',r.dismiss,true);document.addEventListener('keydown',r.escape,true);
  }
  closeMenu(r){if(!r.popup)return;r.popup.remove();r.popup=null;document.removeEventListener('pointerdown',r.dismiss,true);document.removeEventListener('keydown',r.escape,true);}
  setHeight(table,height){
    const r=this.records.get(table),v=r?.view,cm=v?.editor?.cm;
    if(!cm||this.plugin.composing)return;
    // Resolve the current source position at click time, never retain offsets
    // across edits above this table.
    let start;try{start=cm.state.doc.lineAt(cm.posAtDOM(table)).number-1;}catch{return;}
    const source=cm.state.doc.toString();
    const model=this.plugin.memoryTables(source,v.file.path,true).find(t=>t.start===start);
    if(!model)return;
    cm.dispatch({changes:heightChange(source,start,height),annotations:isolateHistory.of('full'),userEvent:'input'});
    this.plugin.schedule();
  }
  clean(table){const r=this.records.get(table);if(r)this.closeMenu(r);r?.caption?.remove();if(r){table.removeEventListener('click',r.click);table.removeEventListener('mousedown',r.down,true);}table.classList.remove('mte-compact');delete table.dataset.mteRowHeight;table.querySelectorAll('.mte-compact-summary').forEach(e=>e.remove());table.querySelectorAll('.mte-compact-body').forEach(e=>e.replaceWith(...e.childNodes));table.querySelectorAll('.mte-compact-open').forEach(e=>e.classList.remove('mte-compact-open'));this.records.delete(table);}
  prune(){for(const [t]of this.records)if(!t.isConnected)this.clean(t);}
  destroy(){for(const [t]of this.records)this.clean(t);}
}
module.exports={CompactTable};
