## 2024-05-22 - [Performance: Debouncing Storage Writes]
**Learning:** Frequent synchronous writes to `vscode.Memento` (via `saveToStorage`) in a loop (e.g. iterating dependencies) can cause significant I/O overhead.
**Action:** Always debounce persistence calls when updating cache entries in a loop, or use a batch update mechanism.
