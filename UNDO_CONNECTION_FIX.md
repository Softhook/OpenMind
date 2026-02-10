# Fix for Undo Connection Visual Restoration Issue

## Problem
When a user deleted a box with connections and pressed undo, the box would be restored but the connections would not be visually restored.

## Root Cause
Race condition in the Yjs observer callbacks:

1. When undo fires, Yjs calls both the `yboxes` observer and `yconnections` observer
2. The boxes observer runs first and sets `isSyncing = true` to prevent feedback loops
3. The connections observer checked `if (this.isSyncing) return;` and would skip execution
4. Even though the boxes observer sets `isSyncing = false` at the end, if there was any condition where `isSyncing` remained true (or was set by another operation), the connections observer would skip
5. Result: connections were not rebuilt, so they didn't appear visually

## Solution
Modified the connections observer to check for undo/redo transactions BEFORE checking `isSyncing`:

### Before:
```javascript
this.yconnections.observe((event) => {
    const isUndoRedo = event.transaction.origin === this.undoManager;
    if (this.isSyncing) return;  // ❌ Would skip during undo/redo
    if (event.transaction.local && !isUndoRedo) return;
    // ... rebuild connections
});
```

### After:
```javascript
this.yconnections.observe((event) => {
    const isUndoRedo = event.transaction.origin === this.undoManager;
    if (this.isSyncing && !isUndoRedo) return;  // ✅ Allows undo/redo to proceed
    if (event.transaction.local && !isUndoRedo) return;
    // ... rebuild connections
});
```

## Why This Works
- During normal operations, if `isSyncing` is true, the observer still skips (prevents feedback loops)
- During undo/redo operations, even if `isSyncing` is true, the observer proceeds
- This ensures `_rebuildConnectionsFromYjs()` is called, which:
  1. Clears the existing connections array
  2. Rebuilds connections from the Yjs state (which includes restored connections)
  3. Creates new `Connection` objects that are visually rendered

## Testing
Added 4 new tests in `tests/unit/undo_connection_visual_restore.test.js`:
1. Verifies connections observer doesn't skip during undo/redo even if isSyncing is true
2. Verifies the fix has proper documentation
3. Verifies boxes observer handles undo/redo correctly
4. Verifies `_rebuildConnectionsFromYjs` checks for box existence before creating connections

All 383 tests pass.

## Related Code
- `src/CollaborationManager.js` line 1344-1362: connections observer
- `src/CollaborationManager.js` line 1254-1341: boxes observer
- `src/CollaborationManager.js` line 1541-1576: `_rebuildConnectionsFromYjs` method
- `src/CollaborationManager.js` line 1081-1146: `deleteBoxFromYjs` (ensures connections are deleted in same transaction)

## Backward Compatibility
✅ Fully backward compatible. No changes to:
- Yjs document structure
- Network protocol  
- File format
- Public API
