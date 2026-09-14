# Local fold memory

Tree rows and native table-cell lists use versioned `foldMemory` in plugin data.json. Markdown is never changed by folding. Records contain source offsets, node kind/depth, explicit-marker baseline, closed state, and a SHA-256 document fingerprint. No document UUID is required.

Foldable nodes have persistent internal UUIDs and hashed structural descriptors (column headings, label, children and neighboring cells). Local edits, external writes and offline changes use the same bidirectionally unique matching passes. Content is not stored in these descriptors. Unmatched or ambiguous nodes receive fresh IDs; only their state resets. File/folder rename events migrate path keys; delete clears records. Copying Markdown to another vault does not copy personal view state.

Search highlighting temporarily reveals matching cell branches without changing saved folds. Clearing the host's search highlight restores the saved state. Explicit user folding still updates persistent memory.

The data version remains 1 with additive identities so the checkpoint build can still read current positional records. Old positional records acquire identities on the first unchanged load; if the original fingerprint is already unavailable, their previous identity cannot be reconstructed reliably. Duplicate identical branches are deliberately treated as ambiguous. Concurrent changes to every identifying part of a branch may reset that branch, but never clear unrelated records.

Legacy states/cellFolds are retained in legacyFoldState for recovery but not guessed onto new positions. They may need to be set again once. To roll back, restore legacyFoldState.states/cellFolds as top-level fields with the previous plugin artifact. Explicit Markdown fold markers remain supported.

Validated in Sandbox: real pointer folding, CodeMirror focused fold restoration, parent text editing, blur, source prefix insertion, closed file rename, folder rename, plugin reload. Tests include same-line-count external changes, sibling insertion/deletion, escaped pipes, native alignment and state serialization. Large cut/paste moves can intentionally reset state when anchors cannot be mapped safely.
