# Local fold memory

Tree rows and native table-cell lists use versioned `foldMemory` in plugin data.json. Markdown is never changed by folding. Records contain source offsets, node kind/depth, explicit-marker baseline, closed state, and a SHA-256 document fingerprint. No document UUID is required.

Normal CodeMirror edits map positions through changes. Native whole-cell replacements are narrowed to actual edits; padding-only table formatting is mapped by unchanged structure. Deleted anchors or changed hierarchy invalidate the affected record. Reopening externally changed source invalidates the document's records, including same-line-count changes. File/folder rename events migrate path keys; delete clears records. Copying Markdown to another vault does not copy personal view state.

Legacy states/cellFolds are retained in legacyFoldState for recovery but not guessed onto new positions. They may need to be set again once. To roll back, restore legacyFoldState.states/cellFolds as top-level fields with the previous plugin artifact. Explicit Markdown fold markers remain supported.

Validated in Sandbox: real pointer folding, CodeMirror focused fold restoration, parent text editing, blur, source prefix insertion, closed file rename, folder rename, plugin reload. Tests include same-line-count external changes, sibling insertion/deletion, escaped pipes, native alignment and state serialization. Large cut/paste moves can intentionally reset state when anchors cannot be mapped safely.
