# OpenMind Documentation

## Core Documentation

### [ARCHITECTURE.md](ARCHITECTURE.md)
Complete system architecture documentation including:
- Component architecture and data flow
- State management patterns
- Collaboration model
- Performance considerations

### [UNDO_SYSTEM.md](UNDO_SYSTEM.md)
Comprehensive guide to the undo/redo system:
- How per-user undo works
- Transaction wrapping and grouping
- Edge cases and troubleshooting
- Testing coverage

### [CRITICAL_ANALYSIS.md](CRITICAL_ANALYSIS.md)
Critical analysis of Yjs state management:
- Known architectural risks
- Mitigation strategies
- Current status of issues

### [UNDO_EDGE_CASES.md](UNDO_EDGE_CASES.md)
Detailed edge case analysis for the undo system:
- Multi-user scenarios
- Connection restoration
- State synchronization edge cases

## Archive

The `archive/` folder contains historical documentation of fixes and improvements:
- **UNDO_SYSTEM_FIX_SUMMARY.md** - Race condition fixes
- **COMPREHENSIVE_UNDO_REVIEW.md** - System verification  
- **Y_INDEXEDDB_ANALYSIS.md** - IndexedDB migration analysis
- **SYNC_INDICATOR_REVIEW.md** - Sync indicator improvements
- **ENTITY_TAGGING.md** - Unimplemented feature spec

These documents are kept for historical reference but may not reflect the current state of the codebase.
