# Column widths sandbox implementation

Baseline: 07953bd. Branch: codex/table-column-widths.

Widths belong to header cells, e.g. `场景 <!-- width=160 -->`. Units are CSS pixels;
60–2400px limits apply. Drag the right edge of a header, or focus its resize handle
and use Left/Right (10px). First drag records all current column widths to prevent
unfixed columns from absorbing the change. Live Preview saves one editor transaction
on pointer release; reading view uses a guarded vault.process write.

Only tables with width metadata switch to fixed layout. Their immediate parent
provides horizontal scrolling. Other tables retain automatic layout until resized.
Existing table-width-scroll CSS remains installed: explicit table layout/width
properties override its content-sized behavior only for managed tables. No old span
widths are migrated automatically. Metadata uses native Obsidian behavior: visible while editing the header, hidden in rendered text. No custom metadata decorations or protected edits.

## Validation

- 10 model tests pass (including escaped pipes, no-edge-pipe headers, fenced examples).
- Old production table-width-scroll CSS enabled in Sandbox.
- Native drag moves column 1 from 160 to 220; other columns remain 400 and 600.
- Actual measured widths are within 1 CSS pixel of requested values.
- Scroll container clientWidth=984 and scrollWidth=1224 after drag.
- Long unbroken text wraps without widening its column.
- Header native editor displays the original width comment (custom hiding removed by request).
- Reading view keeps 220/400/600 and horizontal scrolling; actual screenshots inspected.
- Sandbox smoke check passed. No production deployment.

## Concurrent work

Another agent replaced the shared my-table-extended sandbox artifact during this
session. Final width-module verification uses a separate my-table-width-sandbox
plugin, containing identical column-widths.cjs and widths.cjs, alongside the other
agent's base plugin. This experiment must be disabled before enabling an integrated
build that also contains ColumnWidths. Main source integration is four lifecycle
hooks in plugin.cjs, for straightforward cherry-pick/merge.

Not validated here: mobile, merged/nonstandard tables, concurrent remote editing,
all embedded third-party renderers. Legacy width spans are not converted. A stale
source snapshot during a drag cancels its write instead of overwriting new content.

Follow-up: removed nested wrapper scrolling; Live Preview uses the existing outer cm-table-widget. Verified wide table has horizontal scrolling only and narrow table has no redundant scrollbar.

Full-height drag follow-up: resize hit regions extend from the header through the
last table row. Default grip chrome removed; hover/drag uses a one-pixel accent line.
ResizeObserver updates hit-region height as wrapping changes. Commit applies the
new layout synchronously and a pre-paint MutationObserver handles recreated native
tables, eliminating the previous debounced/interval-sized gap. Native drag from
near the bottom boundary changed 306 to 351. Forty-five animation-frame samples
across release all measured 350.993px with no missing table frame. Screenshot
/tmp/full-column-grip.png inspected; sandbox only.
