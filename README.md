# My Table Extended

## Groups

Use `# Group`, `#- Collapsed group`, or `#+ Expanded group` in the hierarchy column. A group contains all following rows until the next group or table end. Objects within a group remain ordinary root rows; `>` still denotes actual children. Only one group level is supported. Group rows keep native editable cells and use a subtle background and bold text. Export/clear fold-state commands include groups and preserve the `#` marker.

Add a comment immediately before a Markdown table:

```md
<!-- tree-table column=0 -->

| Q | Description |
| --- | --- |
| Parent | ... |
| > Child | ... |
| >>- Grandchild, collapsed by default | ... |
| >>+ Grandchild, expanded by default | ... |
```

`>` encodes depth. `-` encodes a portable default-collapsed state, and `+` encodes a portable default-expanded state. Without `+` or `-`, click state is saved in the plugin data for that vault. Use **Write current tree-table fold state to Markdown** to make current clicks portable.

`column=0` is the zero-based hierarchy column and is recommended for short tables. `column="0"` is equivalent. A column name such as `column="Q"` remains supported. The `id="ideas"` attribute is optional; omit it unless you want a stable table identity when headings or root labels change.

The plugin does not rewrite Markdown when folding. It enhances only activated tables and leaves ordinary tables alone.

## State and compatibility

- Clicks are remembered locally even on explicitly marked rows. Changing that row's `+`/`-` marker resets the remembered override.
- Top-level rows use `- Parent` / `+ Parent`. The state applies to descendants, not the row itself.
- Without an ID, tables are identified by their order among tree tables in the note, so editing object text does not reset unrelated folds. An optional unique table ID (`<!-- tree-table column="Q" id="ideas" -->`) keeps identity stable when tables are reordered. Row identity uses group and ancestor labels; renaming or moving that row can reset its own remembered state. Duplicate paths are distinguished by occurrence order.
- Dragging over rendered cell text creates a normal text selection instead of native multi-cell selection. Use keyboard navigation to enter the native cell editor.
- Commands operate on tree tables in the current note. The export/clear commands require editing mode and support native undo.
- Desktop Obsidian 1.13.7 was tested. Navigation uses a small native-table adapter and may require updates after Obsidian changes its editor internals.
- Tree-aware dragging and sorting are not included. Plain table drag is blocked; native sorting is guarded when the table adapter is active. Move entire subtrees in source mode.

## Validation (2026-09-10)

Passed: 5 model tests (including escaped pipes, fenced examples, invalid hierarchy, duplicate identity and 200 rows), actual Chromium click/reload persistence, unchanged source on fold, export with one-step undo, reading/live rendering, marker removal cleanup, reverse Tab and vertical boundary navigation, Chromium composition commit/cancel/undo, and Sandbox runtime smoke test. Screenshot: `/tmp/my-table-extended-acceptance.png`.

The macOS input-method candidate popup and large-table visual performance were not separately tested. The 200-row check covers parsing only.

## Experimental cell outline (Sandbox only)

Add `<!-- cell-markdown -->` to opt the current note into the experiment.
The native Obsidian table cell editor remains responsible for text, selection,
IME and saving; list lines are stored using the native `<br>` representation.
No dependency on `outliner-extended` is required.

- Plain unordered list previews and active editors display bullets and hanging indents.
- Enter creates the next list node; empty nodes outdent/exit the list.
- Shift+Enter inserts an indented continuation line.
- Tab / Shift+Tab indent / outdent the current subtree.
- Option+Enter / Option+Tab append a sibling / child after the subtree.
- Cmd/Ctrl+Option+Left / Right fold / unfold the active node.

This is an experiment, not general block Markdown support: HTML/rich-content
previews are left native; checkbox widgets, fenced code blocks, reading-view
integration and fold persistence across cell editor lifetimes are not implemented.
Cell navigation via Tab is retained for ordinary non-list cells. Private native
cell editor access is guarded and must be revalidated after Obsidian updates.

Validation: Sandbox native pointer activation and CDP keyboard sequences verified
Enter adds a list item without a table row, Tab/Shift+Tab round-trip, Shift+Enter
continuation and native `<br>` save. Native fold placeholder observed. Long Chinese
list wrapping inspected in actual Electron screenshots. Existing 8 tree-model
tests pass. No production promotion performed.

### Checkbox experiment update
Native `- [ ]` and `- [x]` tasks now have checkbox widgets in plain-cell previews
and active editors. Click writes the native marker; indentation follows list depth.
Enter and structural insertion preserve task type and create unchecked tasks.
A settings toggle enables cell enhancement for all live-preview tables; it defaults
to off while this experiment is being evaluated. Tree-row auto-detection is not enabled.

Validation caught and corrected a one-character replacement range overflow on empty
tasks. Sandbox reload and fresh error check pass after the correction. Preview click
and Enter persistence were observed; full uninterrupted interaction acceptance remains
necessary before promotion. Reading-view checkbox support remains outside this build.


### Single-line row height

The top-left table button toggles compact rows (off by default). It writes only
`<!-- treeTable height: 1 -->` before the table, without column/id parameters or JSON state.

The row-height control offers Default, Low (1 line), Medium (2 lines), High (4 lines), and Extra high (6 lines). Click its main button to switch between Default and Low; use the adjacent menu for any level. Non-default levels are stored as `<!-- treeTable height: N -->` above the table. The Markdown cell content remains unchanged.
Existing tree-table declarations remain compatible; auto-detected grouped tables
need no extra declaration. Clicking a cell opens the native full editor; leaving
the cell restores its one-line summary. Window blur keeps the active editor open.
The switch is an isolated Markdown undo/redo step. Reading views render compact
rows too; click a cell to reveal it. The switch itself is available in Live Preview.

The earlier unnamespaced `<!-- height: 1 -->` is still readable; new toggles write the namespaced form.

Single-line row height is available on ordinary Markdown tables as well as TreeTables. It does not enable tree grouping or hierarchy for ordinary tables.

Automatic columns hug rendered content up to 550px (the former table CSS threshold). Change “自动列宽上限（px）” in settings. Explicit header widths override this limit. Dragging a column writes only that column; other columns remain automatic.

## YAML lookup columns

An empty cell can display a property from the note linked in another column:

```md
| 问题 | 模型 <!-- lookup @iqb-判别模型 --> |
| --- | --- |
| [[问题甲]] | |
```

The source defaults to column `0` (zero-based). Use `<!-- lookup @模型 from=1 -->`
for another source column. `<!-- lookup from=0 property=模型 -->` is equivalent;
quote property names containing spaces: `<!-- lookup @"判别 模型" -->`.

Works in ordinary Markdown tables and TreeTables, in Live Preview and reading mode.
Generated values use normal cell styling. Missing properties and empty values display a muted `-`
with the diagnostic in the cell tooltip. These values are display-only:
entering text overrides the lookup; clearing it restores the generated value.
Group rows and source cells without note links are skipped. Multiple source links,
missing notes, missing properties and invalid column references show a diagnostic.
Properties use exact YAML keys; zero and false are valid values. Referenced metadata
changes trigger refresh. Normal Obsidian link renaming keeps the source link current
when automatic internal-link updates are enabled. No My Transclusion dependency.
