# Undo/Redo System Documentation

## Overview

OpenMind uses Yjs UndoManager for collaborative undo/redo functionality. This system allows each user to undo their own changes without affecting other users' work, even in real-time collaborative sessions.

## Architecture

The undo system is built on three key components:

1. **Yjs UndoManager** - Tracks operations at the CRDT level
2. **Transaction Wrapping** - Groups related changes into atomic undo steps
3. **Per-User Tracking** - Uses Yjs origin strings to identify which user made each change

### Key Features

- **Per-user undo/redo**: Each user can undo only their own changes
- **Smart text grouping**: Continuous typing is grouped into single undo steps
- **Action-based boundaries**: Distinct actions (alignment, deletion, paste) create separate undo steps
- **Collaborative safety**: Undo/redo never affects other users' simultaneous edits

## Implementation Details

### Transaction Origins

All local changes are wrapped with `origin: undoManager` to mark them as undoable:

```javascript
ydoc.transact(() => {
    // Make changes to yboxes/yconnections
}, undoManager);
```

### Text Edit Grouping

Text edits use a 1-second timeout to group consecutive typing:

- Typing continuously → single undo step
- Pause for 1+ second → new undo boundary
- Switch to different box → new undo boundary
- Click away from editing → new undo boundary

### Debouncing and Sync

To balance network efficiency with undo reliability:

- **TEXT_SYNC_DEBOUNCE (300ms)**: Batches text changes for network
- **TEXT_UNDO_GROUP_TIMEOUT (1000ms)**: Groups typing for UX
- Pending syncs are flushed before closing undo groups to prevent split operations

## Edge Cases Handled

### Multi-User Scenarios

1. **Concurrent editing protection**: Remote text updates are blocked if local user is actively editing
2. **Remote deletion handling**: Pending timers are cleared when boxes are deleted by other users
3. **Undo during remote edits**: Force-apply mode ensures undo/redo overrides local editing state

### Connection Undo

- Box deletion includes connection cleanup in the same transaction
- Undo restores both boxes AND their connections atomically
- Connection changes are synced immediately after undo/redo

### State Synchronization

- IndexedDB persistence ensures offline undo/redo works
- Legacy localStorage migration is handled safely
- Undo groups are properly closed during state transitions

## Testing

The undo system has comprehensive test coverage:

- `tests/unit/undo_comprehensive_review.test.js` - Core functionality
- `tests/unit/undo_edge_cases.test.js` - Edge case protection
- `tests/unit/undo_connections.test.js` - Connection restoration
- `tests/unit/undo_guarantee_verification.test.js` - Data loss prevention
- `tests/unit/undo_reliability.test.js` - Timing and race conditions

## Known Limitations

1. Undo/redo only works for changes made through the UI (not external API changes)
2. Alignment operations create separate undo steps even if triggered rapidly
3. Paste operations always create distinct undo boundaries

## Troubleshooting

### Undo not working
- Check that `collaborationManager.isReady` is true
- Verify UndoManager is initialized with correct tracked types
- Ensure changes are wrapped with `origin: undoManager`

### Undo restoring wrong content
- Check that proper `forceApply` flag is used for undo/redo rebuilds
- Verify transaction boundaries are properly closed before undo
- Look for pending debounced syncs that weren't flushed

### Undo affecting other users
- Verify origin strings are being set correctly
- Check that UndoManager `captureTransaction` callback filters origins properly
- Ensure collaborative changes use different origin strings

## References

For historical context on fixes and improvements, see:
- [UNDO_SYSTEM_FIX_SUMMARY.md](./archive/UNDO_SYSTEM_FIX_SUMMARY.md) - Race condition fixes
- [UNDO_EDGE_CASES.md](./archive/UNDO_EDGE_CASES.md) - Detailed edge case analysis
- [COMPREHENSIVE_UNDO_REVIEW.md](./archive/COMPREHENSIVE_UNDO_REVIEW.md) - System verification tests
