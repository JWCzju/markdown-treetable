const {MarkdownRenderer, Notice, TFile, setIcon} = require('obsidian');
const {parse} = require('./model.cjs');
const {replaceCell, fieldInfo} = require('./row-detail-model.cjs');
const {createGroupToggle} = require('@my/property-surface/group-toggle');
const {createMarkdownEditor} = require('@my/property-surface/markdown-editor');
const {previewSource} = require('@my/property-surface/preview-source');

class RowDetail {
  constructor(plugin) { this.plugin = plugin; }

  attach(element, table) {
    const rows = element.querySelectorAll('tbody > tr');
    table.rows.forEach((row, index) => {
      if (row.group) return;
      const cell = rows[index]?.cells[table.col];
      if (!cell) return;
      const button = cell.ownerDocument.createElement('button');
      button.className = 'mte-row-detail-button clickable-icon';
      button.type = 'button';
      button.title = '查看详情';
      button.setAttribute('aria-label', `查看${row.label}详情`);
      button.setAttribute('data-wld-open', '');
      setIcon(button, 'panel-right-open');
      const activate = event => {
        event.preventDefault();
        event.stopPropagation();
        void this.open(button, table, row);
      };
      button.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        activate(event);
      });
      button.addEventListener('click', event => {
        if (event.detail === 0) activate(event);
        else event.stopPropagation();
      });
      cell.appendChild(button);
    });
  }

  async open(button, table, row) {
    const drawer = this.plugin.app.plugins?.plugins?.['my-wikilink-drawer']?.api;
    if (drawer?.version !== 1 || !drawer.openCustom) {
      new Notice('请在沙盒启用最新版 Joule 抽屉插件');
      return;
    }
    const file = this.plugin.app.vault.getAbstractFileByPath(table.path);
    if (!(file instanceof TFile)) return;
    const sourceView = this.sourceView(table.path);
    const source = sourceView ? sourceView.editor.getValue() : await this.plugin.app.vault.cachedRead(file);
    const currentTable = parse(source, table.path, {autoDetect:true}).find(t => t.tree && t.identity === table.identity);
    const currentRow = currentTable?.rows.find(r => r.key === row.key && source.split('\n')[r.line] === source.split('\n')[row.line]);
    if (!currentRow) { new Notice('表格已变化，请重新打开详情'); return; }
    const anchor = {path:table.path, tableId:table.identity, rowKey:currentRow.key,
      raw:source.split('\n')[currentRow.line], cells:[...currentRow.cells]};
    await drawer.openCustom(file, {sourceElement:button, render:container => this.render(container, anchor, currentTable)});
  }

  sourceView(path) {
    return this.plugin.app.workspace.getLeavesOfType('markdown').map(leaf => leaf.view)
      .find(view => view.file?.path === path && view.getMode?.() === 'source' && view.editor?.cm?.state.doc.length);
  }

  render(container, anchor, table) {
    container.empty();
    anchor.container = container;
    container.addClass('mte-row-detail');
    const header = container.createDiv({cls:'mte-row-detail-header'});
    header.createEl('h2', {text:anchor.cells[table.col] || '未命名'});
    const body = container.createDiv({cls:'mte-row-detail-body'});
    body.createDiv({cls:'mte-row-detail-caption', text:'记录属性'});
    const detail = body.createDiv({cls:'ps-properties mte-row-detail-fields'});
    let lastGroup = null;
    let groupBody = null;
    table.headers.forEach((rawHeader, column) => {
      const {label, group} = fieldInfo(rawHeader);
      if (group !== lastGroup) {
        groupBody = null;
        if (group) {
          const section = detail.createDiv({cls:'ps-property-group'});
          const content = section.createDiv({cls:'ps-property-group-content'});
          groupBody = content;
          createGroupToggle(section, {name:group, className:'ps-property-group-title', onToggle:expanded => {
            content.hidden = !expanded;
          }});
          section.appendChild(content);
        }
      }
      lastGroup = group;
      const item = (groupBody || detail).createDiv({cls:'ps-property-row'});
      item.createDiv({cls:'ps-property-key', text:label || `列 ${column + 1}`});
      const valueCell = item.createDiv({cls:'ps-property-value mte-row-detail-value'});
      this.renderValue(valueCell, anchor, column, table);
    });
  }

  renderValue(cell, anchor, column, table) {
    cell.empty();
    const value = anchor.cells[column] || '';
    if (/^- \[[ xX]\]$/.test(value)) {
      const checkbox = cell.createEl('input', {type:'checkbox'});
      checkbox.checked = /\[[xX]\]/.test(value);
      checkbox.setAttribute('aria-label', fieldInfo(table.headers[column]).label);
      checkbox.addEventListener('change', async () => {
        const saved = await this.save(anchor, column, checkbox.checked ? '- [x]' : '- [ ]');
        if (!saved) checkbox.checked = !checkbox.checked;
      });
      return;
    }
    const source = value.replace(/<br\s*\/?\s*>/gi, '\n');
    const host = cell.createDiv({cls:'mpv-field'});
    const preview = host.createDiv({cls:'mpv-preview markdown-rendered', attr:{role:'button',tabindex:'0'}});
    const content = preview.createDiv({cls:'mpv-preview-content'});
    if (source) void MarkdownRenderer.render(this.plugin.app, previewSource(source), content, anchor.path, this.plugin);
    else content.createSpan({cls:'mpv-empty', text:'没有值'});
    preview.title = '点击编辑';
    const edit = event => {
      if (event.target.closest?.('a')) return;
      preview.hidden = true;
      host.addClass('yaml-ext-editing');
      const area = host.createDiv({cls:'mpv-editor'});
      let draft = source;
      let finished = false;
      const finish = async commit => {
        if (finished) return;
        finished = true;
        editor.destroy();
        if (commit && draft !== source) {
          const saved = await this.save(anchor, column, draft);
          if (saved && column === table.col) cell.closest('.mte-row-detail')?.querySelector('h2')?.setText(anchor.cells[column]);
        }
        this.renderValue(cell, anchor, column, table);
      };
      const editor = createMarkdownEditor(area, source, {
        label:`${fieldInfo(table.headers[column]).label} Markdown 编辑`,
        onChange:text => { draft = text; },
        onBlur:() => queueMicrotask(() => { if (!host.contains(host.ownerDocument.activeElement)) void finish(true); }),
        onFocus:() => {}
      });
      editor.dom.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !editor.completion?.isOpen()) { event.preventDefault(); event.stopPropagation(); void finish(false); }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.stopPropagation(); void finish(true); }
      }, true);
      editor.focus();
    };
    preview.addEventListener('click', edit);
    preview.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      edit(event);
    });
  }

  async save(anchor, column, value) {
    if (anchor.invalid) return false;
    const file = this.plugin.app.vault.getAbstractFileByPath(anchor.path);
    if (!(file instanceof TFile)) return false;
    let nextRaw = null;
    let nextCells = null;
    let nextKey = null;
    const update = source => {
      const lines = source.split('\n');
      const table = parse(source, anchor.path, {autoDetect:true})
        .find(candidate => candidate.tree && candidate.identity === anchor.tableId);
      const matches = table?.rows.filter(row => row.key === anchor.rowKey && lines[row.line] === anchor.raw) || [];
      if (matches.length !== 1) throw new Error('原行已变化，请关闭后重新打开详情');
      const row = matches[0];
      const changed = replaceCell(lines[row.line], column, value);
      if (changed == null) throw new Error('无法定位单元格');
      lines[row.line] = changed;
      const next = lines.join('\n');
      const reparsed = parse(next, anchor.path, {autoDetect:true})
        .find(candidate => candidate.tree && candidate.identity === anchor.tableId);
      const updated = reparsed?.rows.find(candidate => candidate.line === row.line);
      if (!updated) throw new Error('编辑后表格无法解析');
      nextRaw = changed;
      nextCells = updated.cells;
      nextKey = updated.key;
      return {next, line:row.line, old:source.split('\n')[row.line]};
    };
    try {
      const view = this.sourceView(anchor.path);
      if (view) {
        const {next, line, old} = update(view.editor.getValue());
        view.editor.transaction({changes:[{from:{line,ch:0},to:{line,ch:old.length},text:next.split('\n')[line]}]});
      } else {
        await this.plugin.app.vault.process(file, source => update(source).next);
      }
      anchor.raw = nextRaw;
      anchor.cells = [...nextCells];
      anchor.rowKey = nextKey;
      return true;
    } catch (error) {
      anchor.invalid = true;
      anchor.container?.querySelector('.mte-row-detail-header')?.createDiv({
        cls:'mte-row-detail-error', text:'源表已变化，请关闭详情后重新打开。'
      });
      new Notice(String(error.message || error));
      return false;
    }
  }
}

module.exports = {RowDetail};
