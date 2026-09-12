const { Plugin, Notice, setIcon, PluginSettingTab, Setting } = require('obsidian');
const { parse, folded, visibility } = require('./model.cjs');
const { ColumnWidths } = require('./column-widths.cjs');
const { CellOutline } = require('./cell-outline.cjs');

class MyTableExtended extends Plugin {
  async onload() {
    const saved = await this.loadData();
    this.states = saved?.states || {};
    this.cellMarkdownGlobal = saved?.cellMarkdownGlobal ?? true;
    this.autoDetectTree = saved?.autoDetectTree ?? true;
    this.addSettingTab(new CellSettings(this.app, this));
    this.adapters = new Map();
    this.cellOutline = new CellOutline(this);
    this.columnWidths = new ColumnWidths(this);
    this.textSelectionGuards = new Map();
    this.reading = new Map();
    this.composing = false;
    this.observer = new MutationObserver(() => this.schedule());
    this.imageLoads = new WeakSet();
    this.observe();
    this.register(() => this.observer.disconnect());
    this.registerEvent(this.app.workspace.on('layout-change', () => this.schedule()));
    this.registerEvent(this.app.workspace.on('editor-change', () => this.schedule()));
    this.registerDomEvent(document, 'compositionstart', () => { this.composing = true; }, true);
    this.registerDomEvent(document, 'compositionend', () => { this.composing = false; this.schedule(); }, true);
    this.registerDomEvent(document, 'pointerdown', event => this.onToggle(event), true);
    for (const type of ['mousedown', 'click']) this.registerDomEvent(document, type, event => {
      if (event.target.closest?.('.mte-toggle')) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    this.registerDomEvent(document, 'keydown', event => this.onKeydown(event), true);
    this.registerDomEvent(document, 'contextmenu', () => {
      for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
        const table = leaf.view.editMode?.tableCell?.table;
        if (table?.tableEl?.classList.contains('mte-table')) this.adaptNavigation(table);
      }
    }, true);
    this.registerDomEvent(document, 'dragstart', event => {
      if (event.target.closest?.('.mte-table')) { event.preventDefault(); new Notice('树表暂不支持拖行，请在源码中移动完整子树'); }
    }, true);
    this.registerMarkdownPostProcessor((el, ctx) => this.decorateReading(el, ctx));
    this.addCommand({ id: 'write-fold-state-to-markdown', name: 'Write current tree-table fold state to Markdown', checkCallback: checking => this.writeFoldState(checking) });
    this.addCommand({ id: 'clear-explicit-fold-markers', name: 'Clear explicit tree-table fold markers', checkCallback: checking => this.clearExplicitMarkers(checking) });
    for (const closed of [true, false]) this.addCommand({ id: closed ? 'collapse-all' : 'expand-all', name: closed ? 'Collapse all tree tables in current note' : 'Expand all tree tables in current note', callback: () => this.setAll(closed) });
    this.schedule();
  }

  observe() { this.observer.observe(document.body, { childList: true, subtree: true, characterData: true }); }
  schedule() {
    if (this.queued || this.composing) return;
    this.queued = true;
    this.timer = window.setTimeout(() => { this.queued = false; this.scanLiveTables(); }, 40);
  }

  scanLiveTables() {
    if (this.composing) return;
    this.observer.disconnect();
    try {
      for (const [table, originals] of this.adapters) if (!table.tableEl?.isConnected) { Object.assign(table, originals); this.adapters.delete(table); }
      for (const [element, table] of this.reading) {
        if (!element.isConnected) this.reading.delete(element);
        else this.decorate(element, table);
      }
      for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
        const view = leaf.view;
        const cm = view.editor?.cm;
        if (!cm || view.getMode?.() !== 'source' || !view.file) continue;
        this.cellOutline.scan(view);
        this.columnWidths.scan(view);
        const model = parse(cm.state.doc.toString(), view.file.path, {autoDetect: this.autoDetectTree});
        for (const element of view.containerEl.querySelectorAll('table.table-editor')) {
          try {
            const start = cm.state.doc.lineAt(cm.posAtDOM(element)).number - 1;
            const table = model.find(candidate => candidate.start === start);
            this.decorate(element, table);
          } catch (_) { /* The native editor can replace a table during this pass. */ }
        }
        // Obsidian may retain a cloned table editor whose DOM position no longer
        // maps to the current CodeMirror line. Match strict first-cell syntax as
        // a fallback so production and Sandbox use the same auto-detection.
        for (const element of view.containerEl.querySelectorAll('table.table-editor:not(.mte-table)')) {
          const first = element.querySelector('tbody > tr > td')?.textContent?.trim() || '';
          const count = element.querySelectorAll('tbody > tr').length;
          const candidate = model.find(t => t.rows.length === count && t.rows[0]?.cells[0] === first);
          if (candidate) this.decorate(element, candidate);
        }
      }
    } finally { this.observe(); }
  }

  async decorateReading(el, ctx) {
    const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!file) return;
    const candidates = parse(await this.app.vault.cachedRead(file), ctx.sourcePath, {autoDetect: this.autoDetectTree});
    if (this.unloaded) return;
    for (const element of el.querySelectorAll('table')) {
      const section = ctx.getSectionInfo(element);
      const first = element.querySelector('tbody > tr > td')?.textContent?.trim() || '';
      const count = element.querySelectorAll('tbody > tr').length;
      const table = candidates.find(candidate => candidate.start === section?.lineStart) ||
        candidates.find(candidate => candidate.rows.length === count && candidate.rows[0]?.cells[0] === first && candidate.valid);
      if (table) { this.reading.set(element, table); this.schedule(); }
    }
  }

  decorate(element, table) {
    // Rich embeds can settle asynchronously after the Markdown cell is mounted.
    // Preserve the current DOM until every image has a stable intrinsic size.
    // complete is an HTMLImageElement property, not an HTML attribute. Cached
    // images have already fired load and must never block table decoration.
    const pending = [...element.querySelectorAll('.internal-embed img')].filter(img => !img.complete);
    if (pending.length) {
      for (const img of pending) if (!this.imageLoads.has(img)) {
        this.imageLoads.add(img);
        img.addEventListener('load', () => this.schedule(), { once: true });
        img.addEventListener('error', () => this.schedule(), { once: true });
      }
      return;
    }
    this.cleanup(element);
    if (!table?.valid) return;
    const rows = [...element.querySelectorAll('tbody > tr')];
    if (rows.length !== table.rows.length) return;
    element.classList.add('mte-table');
    element.classList.toggle('mte-grouped', table.rows.some(row => row.group));
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      const nativeTable = leaf.view.editMode?.tableCell?.table;
      if (nativeTable?.tableEl === element) this.adaptNavigation(nativeTable);
    }
    const header = element.querySelector('thead th');
    if (header) element.style.setProperty('--mte-header-color', getComputedStyle(header).backgroundColor);
    const hidden = visibility(table.rows, this.states);
    // Do not hide a live native cell editor while it owns keyboard focus.
    if (rows.some((row, index) => hidden[index] && row.contains(document.activeElement))) return;
    let groupIndent = 0;
    table.rows.forEach((row, index) => {
      if (row.group) groupIndent = (row.groupLevel || 1) - 1;
      const tr = rows[index];
      const cell = tr.cells[table.col];
      if (!cell) return;
      tr.classList.toggle('mte-hidden', hidden[index]);
      tr.classList.toggle('mte-group', !!row.group);
      cell.classList.add('mte-cell');
      cell.style.setProperty('--mte-depth', row.group ? groupIndent : row.depth + groupIndent);
      if (!row.hasChildren) return;
      const button = document.createElement('button');
      const closed = folded(row, this.states);
      button.className = 'mte-toggle';
      button.type = 'button';
      button.tabIndex = -1;
      button.dataset.key = row.key;
      button.dataset.explicit = row.explicit;
      button.dataset.table = table.identity;
      setIcon(button, closed ? 'chevron-right' : 'chevron-down');
      button.title = closed ? '展开子项' : '折叠子项';
      button.setAttribute('aria-label', closed ? '展开子项' : '折叠子项');
      button.setAttribute('aria-expanded', String(!closed));
      cell.appendChild(button);
    });
    this.hidePrefixes(element, table);
    // Let the browser own text drag selection inside tree-table cells. Obsidian's
    // table editor otherwise treats a drag as a multi-cell selection.
    this.guardTextSelection(element);
  }

  guardTextSelection(element) {
    if (!element.classList.contains('table-editor')) return;
    for (const cell of element.querySelectorAll('tbody td')) {
      if (this.textSelectionGuards.has(cell)) continue;
      const guard = event => {
        if (event.button !== 0 || event.target.closest?.('.mte-toggle, .cm-editor, input, textarea')) return;
        event.stopPropagation();
      };
      cell.addEventListener('pointerdown', guard, true);
      cell.addEventListener('mousedown', guard, true);
      this.textSelectionGuards.set(cell, guard);
    }
  }

  hidePrefixes(element, table) {
    const rows = [...element.querySelectorAll('tbody > tr')];
    table.rows.forEach((row, index) => {
      if (!row.prefix) return;
      const cell = rows[index]?.cells[table.col];
      const wrapper = cell?.querySelector(':scope > .table-cell-wrapper') || (element.classList.contains('table-editor') ? null : cell);
      if (!wrapper || wrapper.querySelector('.cm-editor') || wrapper.isContentEditable) return;
      const node = wrapper.firstChild;
      if (row.group && node && node.nodeType === Node.TEXT_NODE && node.textContent.startsWith(row.prefix)) {
        const prefix = document.createElement('span'); prefix.className = 'mte-group-prefix'; prefix.textContent = row.prefix;
        node.textContent = node.textContent.slice(row.prefix.length); wrapper.insertBefore(prefix, node); return;
      }
      if (!node || node.nodeType !== Node.TEXT_NODE || !node.textContent.startsWith(row.prefix)) return;
      const prefix = document.createElement('span');
      prefix.className = 'mte-prefix';
      prefix.textContent = row.prefix;
      node.textContent = node.textContent.slice(row.prefix.length);
      wrapper.insertBefore(prefix, node);
    });
  }

  cleanup(element) {
    element.classList.remove('mte-table');
    element.classList.remove('mte-grouped');
    element.style.removeProperty('--mte-header-color');
    for (const row of element.querySelectorAll('.mte-hidden')) row.classList.remove('mte-hidden');
    for (const row of element.querySelectorAll('.mte-group')) row.classList.remove('mte-group');
    for (const wrapper of element.querySelectorAll('.mte-group-content')) wrapper.classList.remove('mte-group-content');
    for (const wrapper of element.querySelectorAll('.mte-reading-group-content')) wrapper.replaceWith(...wrapper.childNodes);
    for (const prefix of element.querySelectorAll('.mte-group-prefix')) prefix.replaceWith(document.createTextNode(prefix.textContent));
    for (const button of element.querySelectorAll('.mte-toggle')) button.remove();
    for (const prefix of element.querySelectorAll('.mte-prefix')) prefix.replaceWith(document.createTextNode(prefix.textContent));
    for (const cell of element.querySelectorAll('.mte-cell')) { cell.classList.remove('mte-cell'); cell.style.removeProperty('--mte-depth'); }
    for (const cell of element.querySelectorAll('tbody td')) {
      const guard = this.textSelectionGuards.get(cell);
      if (!guard) continue;
      cell.removeEventListener('pointerdown', guard, true);
      cell.removeEventListener('mousedown', guard, true);
      this.textSelectionGuards.delete(cell);
    }
  }

  onToggle(event) {
    const host = event.target.closest?.('table.mte-table');
    if (host) {
      for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
        const nativeTable = leaf.view.editMode?.tableCell?.table;
        if (nativeTable?.tableEl === host) this.adaptNavigation(nativeTable);
      }
    }
    const button = event.target.closest?.('.mte-toggle');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (this.composing) return;
    document.activeElement?.blur?.();
    const current = this.states[button.dataset.key];
    const closed = current?.explicit === button.dataset.explicit ? !current.closed : button.getAttribute('aria-expanded') === 'true';
    this.states[button.dataset.key] = { closed, explicit: button.dataset.explicit };
    this.saveState();
    this.schedule();
  }

  onKeydown(event) {
    if (event.isComposing || !['Tab', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const target = event.target;
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      const table = leaf.view.editMode?.tableCell?.table;
      if (table?.tableEl?.classList.contains('mte-table') && table.tableEl.contains(target)) this.adaptNavigation(table);
    }
  }

  adaptNavigation(table) {
    if (this.adapters.has(table)) return;
    if (!['getNextCell', 'getCellAbove', 'getCellBelow'].every(name => typeof table[name] === 'function')) {
      this.cleanup(table.tableEl);
      new Notice('当前 Obsidian 表格接口不兼容，已展开全部内容');
      return;
    }
    const originals = {};
    if (typeof table.sortByColumn === 'function') {
      originals.sortByColumn = table.sortByColumn;
      const originalSort = table.sortByColumn;
      table.sortByColumn = function (...args) {
        if (!this.tableEl.classList.contains('mte-table')) return originalSort.apply(this, args);
        new Notice('树表暂不支持排序，请先移除 tree-table 标记');
      };
    }
    if (typeof table.selectCells === 'function') {
      const original = table.selectCells;
      originals.selectCells = original;
      table.selectCells = function (anchor, head, dragging) {
        if (this.tableEl.classList.contains('mte-table')) {
          this.deselectCells?.();
          return;
        }
        return original.call(this, anchor, head, dragging);
      };
    }
    for (const name of ['getNextCell', 'getCellAbove', 'getCellBelow']) {
      if (typeof table[name] !== 'function') continue;
      const original = table[name];
      originals[name] = original;
      table[name] = function (cell, ...args) {
        let next = original.call(this, cell, ...args);
        for (let count = 0; next?.el?.closest('tr')?.classList.contains('mte-hidden') && count < 10000; count++) next = original.call(this, next, ...args);
        return next;
      };
    }
    this.adapters.set(table, originals);
  }

  saveState() {
    const data = JSON.parse(JSON.stringify({ states: this.states, cellMarkdownGlobal: this.cellMarkdownGlobal }));
    this.saveQueue = (this.saveQueue || Promise.resolve()).then(() => this.saveData(data)).catch(error => console.error('My Table Extended: state save failed', error));
    return this.saveQueue;
  }
  async setAll(closed) {
    const view = this.app.workspace.getActiveViewOfType(require('obsidian').MarkdownView);
    if (!view?.file || this.composing) return;
    const source = view.getMode() === 'source' ? view.editor.getValue() : await this.app.vault.cachedRead(view.file);
    document.activeElement?.blur?.();
    for (const table of parse(source, view.file.path).filter(t => t.valid)) for (const row of table.rows) if (row.hasChildren && row.unique) this.states[row.key] = { closed, explicit: row.explicit };
    await this.saveState();
    this.schedule();
  }
  activeSource() {
    const view = this.app.workspace.getActiveViewOfType(require('obsidian').MarkdownView);
    if (!view?.file || view.getMode?.() !== 'source') return null;
    return { view, file: view.file, source: view.editor.getValue() };
  }

  writeFoldState(checking) {
    const active = this.activeSource();
    if (!active) return false;
    const tables = parse(active.source, active.file.path).filter(table => table.valid);
    const candidates = tables.flatMap(table => table.rows.filter(row => row.hasChildren && row.writable && row.unique));
    if (!candidates.length) return false;
    if (checking) return true;
    const replacements = candidates.map(row => ({ line: row.line, ch: row.ch + row.markerOffset, from: row.explicit ? 1 : 0, value: (folded(row, this.states) ? '-' : '+') + (!row.prefix ? ' ' : '') }));
    this.replacePrefixes(active, replacements, '已将当前折叠状态写入 Markdown');
    return true;
  }

  clearExplicitMarkers(checking) {
    const active = this.activeSource();
    if (!active) return false;
    const tables = parse(active.source, active.file.path).filter(table => table.valid);
    const candidates = tables.flatMap(table => table.rows.filter(row => row.explicit && row.writable));
    if (!candidates.length) return false;
    if (checking) return true;
    this.replacePrefixes(active, candidates.map(row => ({ line: row.line, ch: row.ch + row.markerOffset, from: row.markerOffset ? 1 : row.prefix.length, value: '' })), '已清除显式折叠标记');
    return true;
  }

  replacePrefixes(active, replacements, notice) {
    if (this.composing || active.view.editor.getValue() !== active.source) return;
    active.view.editor.transaction({ changes: replacements.map(edit => ({ from: { line: edit.line, ch: edit.ch }, to: { line: edit.line, ch: edit.ch + edit.from }, text: edit.value })) });
    for (const key of Object.keys(this.states)) if (JSON.parse(key)[0] === active.file.path) delete this.states[key];
    this.saveState();
    new Notice(notice);
  }

  onunload() {
    this.unloaded = true;
    this.cellOutline.destroy();
    this.columnWidths.destroy();
    this.observer.disconnect();
    clearTimeout(this.timer);
    for (const [table, originals] of this.adapters) Object.assign(table, originals);
    this.textSelectionGuards.clear();
    for (const element of document.querySelectorAll('.mte-table')) this.cleanup(element);
  }
}

class CellSettings extends PluginSettingTab {
  display() {
    this.containerEl.empty();
    new Setting(this.containerEl).setName('所有表格启用 cell 列表和待办增强').setDesc('关闭时，仅增强包含 <!-- cell-markdown --> 的笔记。开关会重新加载插件以清理编辑器装饰。').addToggle(toggle=>toggle.setValue(this.plugin.cellMarkdownGlobal).onChange(async value=>{
      this.plugin.cellMarkdownGlobal=value;
      await this.plugin.saveData({states:this.plugin.states,cellMarkdownGlobal:value});
      const id=this.plugin.manifest.id;
      await this.app.plugins.disablePlugin(id); await this.app.plugins.enablePlugin(id);
    }));
  }
}
module.exports = MyTableExtended;
