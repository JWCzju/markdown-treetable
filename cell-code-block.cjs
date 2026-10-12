const { Component, MarkdownRenderer } = require('obsidian');
const { Transaction } = require('@codemirror/state');
const { fencedCell } = require('./cell-code-source.cjs');

class CellCodeBlocks {
  constructor(plugin) {
    this.plugin = plugin;
    this.previews = new Map();
  }

  attachEditor(view) {
    const cm = (view.currentMode || view.editMode)?.tableCell?.editor?.cm;
    if (!cm || cm.state.doc.lines !== 1) return;
    const source = cm.state.doc.toString();
    const multiline = fencedCell(source);
    if (!multiline) return;
    cm.dispatch({
      changes: {from: 0, to: cm.state.doc.length, insert: multiline},
      selection: {anchor: multiline.length},
      annotations: Transaction.addToHistory.of(false),
      userEvent: 'set'
    });
  }

  decorate(tableEl, model) {
    if (!model?.valid) {
      for (const [host, entry] of this.previews) if (tableEl.contains(host)) this.remove(host, entry);
      return;
    }
    const rows = [...tableEl.querySelectorAll(':scope > tbody > tr')];
    if (rows.length !== model.rows.length) return;
    for (const [rowIndex, row] of rows.entries()) {
      for (const [col, cell] of [...row.cells].entries()) {
        const source = fencedCell(model.rows[rowIndex].cells[col]);
        const host = cell.querySelector(':scope > .table-cell-wrapper, :scope > .mte-compact-body') || cell;
        const prior = this.previews.get(host);
        if (!source || cell.querySelector('.cm-editor')) {
          if (prior) this.remove(host, prior);
          continue;
        }
        if (prior?.source === source && host.contains(prior.preview)) continue;
        if (prior) this.remove(host, prior);
        const component = new Component();
        component.load();
        const preview = document.createElement('div');
        preview.className = 'mte-codeblock-preview';
        const original = [...host.childNodes];
        host.replaceChildren(preview);
        const entry = {source, preview, original, component};
        this.previews.set(host, entry);
        MarkdownRenderer.render(this.plugin.app, source, preview, model.path, component)
          .then(() => { if (this.previews.get(host) === entry) this.plugin.schedule(); })
          .catch(error => {
            console.error('TreeTable code block render failed', error);
            if (this.previews.get(host) === entry) this.remove(host, entry);
          });
      }
    }
  }

  remove(host, entry) {
    entry.component.unload();
    if (host.contains(entry.preview)) host.replaceChildren(...entry.original);
    this.previews.delete(host);
  }

  prune() {
    for (const [host, entry] of this.previews) {
      if (!host.isConnected || !host.contains(entry.preview)) this.remove(host, entry);
    }
  }

  destroy() {
    for (const [host, entry] of this.previews) this.remove(host, entry);
  }
}

module.exports = { CellCodeBlocks };
