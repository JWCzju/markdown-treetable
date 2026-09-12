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
widths are migrated automatically. Metadata is hidden in the native header editor;
replacing the full header title retains its width. Raw source mode keeps the comments.

## Validation

- 10 model tests pass (including escaped pipes, no-edge-pipe headers, fenced examples).
- Old production table-width-scroll CSS enabled in Sandbox.
- Native drag moves column 1 from 160 to 220; other columns remain 400 and 600.
- Actual measured widths are within 1 CSS pixel of requested values.
- Scroll container clientWidth=984 and scrollWidth=1224 after drag.
- Long unbroken text wraps without widening its column.
- Header native editor shows only title; full-title replacement retains width=220.
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
