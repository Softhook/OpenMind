# OpenMind System Architecture

## Executive Summary

OpenMind is a collaborative real-time mind mapping application built on a three-tier state management architecture with Yjs CRDT as the master state, an in-memory object model for UI representation, and localStorage for offline persistence.

**Version**: 1.1.0  
**Last Updated**: 2026-02-11  
**Architecture Pattern**: CRDT-based Event Sourcing with Observer Pattern

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Principles](#architecture-principles)
3. [Component Architecture](#component-architecture)
4. [State Management](#state-management)
5. [Data Flow Patterns](#data-flow-patterns)
6. [Collaboration Model](#collaboration-model)
7. [Critical Analysis](#critical-analysis)
8. [Known Issues & Mitigations](#known-issues--mitigations)
9. [Performance Considerations](#performance-considerations)
10. [Recommendations](#recommendations)

---

## System Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        User Interface                        │
│                    (p5.js Canvas Rendering)                  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                     MindMap Object                           │
│                  (In-Memory State)                           │
│  ┌──────────────┐              ┌──────────────┐            │
│  │  boxes[]     │              │ connections[]│            │
│  │  (TextBox)   │              │ (Connection) │            │
│  └──────────────┘              └──────────────┘            │
└──────┬────────────────────────────────┬────────────────────┘
       │                                 │
       │  Callbacks                      │ Observers
       ↓                                 ↓
┌─────────────────────────────────────────────────────────────┐
│              CollaborationManager                            │
│                   (Yjs Integration)                          │
│  ┌──────────────────┐      ┌──────────────────┐           │
│  │  yboxes (Map)    │      │ yconnections     │           │
│  │                  │      │ (Array)          │           │
│  └──────────────────┘      └──────────────────┘           │
│  ┌──────────────────┐                                      │
│  │  undoManager     │      ┌──────────────────┐           │
│  │  (Y.UndoManager) │      │  WebSocket       │           │
│  └──────────────────┘      │  Provider        │           │
│                             └──────────────────┘           │
└──────┬────────────────────────────────┬────────────────────┘
       │                                 │
       │ Timer (30s)                     │ Network
       ↓                                 ↓
┌──────────────────┐            ┌──────────────────┐
│  localStorage    │            │  WebSocket       │
│  (JSON Backup)   │            │  Server          │
└──────────────────┘            └──────────────────┘
```

### Technology Stack

- **UI Framework**: p5.js (Canvas-based rendering)
- **State Management**: Yjs (CRDT library)
- **Collaboration**: y-websocket (WebSocket provider)
- **Persistence**: localStorage (Browser API)
- **Build**: Babel (ES6+ transpilation)
- **Testing**: Jest (Unit and integration tests)

---

## Architecture Principles

### 1. **Yjs as Single Source of Truth**

**Principle**: Yjs CRDT is the authoritative state for all operations requiring consistency.

**Rationale**:
- CRDT guarantees eventual consistency across distributed clients
- Eliminates need for manual conflict resolution
- Provides built-in undo/redo via UndoManager
- Supports offline operations with automatic merge on reconnect

**Implementation**:
- All user actions → mindMap → Yjs (via callbacks)
- All Yjs changes → mindMap (via observers)
- localStorage is backup only, never source of truth during collaboration

### 2. **Separation of Concerns**

**Layers**:

1. **Presentation Layer** (p5.js sketch)
   - Rendering and user interactions
   - Event handling (mouse, keyboard)
   - Visual feedback and animations

2. **Domain Layer** (MindMap, TextBox, Connection)
   - Business logic
   - Data validation
   - State transitions

3. **Synchronization Layer** (CollaborationManager)
   - Yjs integration
   - Network communication
   - Conflict resolution
   - Undo/redo management

4. **Persistence Layer** (localStorage)
   - Offline backup
   - Session recovery
   - Import/export

### 3. **Observer Pattern for Reactivity**

**Yjs Observers** → Update local state  
**MindMap Callbacks** → Update Yjs state  
**Autosave Timer** → Persist to localStorage

This creates a reactive system where changes propagate automatically.

---

## Component Architecture

### Core Components

#### 1. MindMap (`src/MindMap.js`)

**Responsibility**: Central domain model managing boxes and connections.

**Key Properties**:
```javascript
{
  boxes: TextBox[],           // Array of text boxes
  connections: Connection[],  // Array of connections
  isSaved: boolean,          // Triggers autosave
  isDirty: boolean,          // Needs redraw
  storageKey: string         // localStorage key
}
```

**Key Methods**:
- `addBox(box)` - Add new box, trigger callbacks
- `addConnection(from, to)` - Create connection, trigger callbacks
- `toJSON()` - Serialize state for localStorage
- `fromJSON(data)` - Deserialize from localStorage
- `saveToLocalStorage()` - Persist to browser storage

**State Mutations**:
- Direct mutations to `boxes[]` and `connections[]`
- Callbacks notify CollaborationManager
- `isSaved = false` triggers autosave

#### 2. CollaborationManager (`src/CollaborationManager.js`)

**Responsibility**: Yjs integration and synchronization.

**Key Properties**:
```javascript
{
  ydoc: Y.Doc,                    // Yjs document
  yboxes: Y.Map,                  // Boxes CRDT
  yconnections: Y.Array,          // Connections CRDT
  undoManager: Y.UndoManager,     // Undo/redo
  provider: WebsocketProvider,    // Network sync
  isSyncing: boolean,             // Prevent loops
  hasLoadedFromLocalStorage: bool // Guard flag
}
```

**Key Methods**:
- `initialize()` - Create Yjs structures, setup observers
- `connect(roomName)` - Join collaboration room
- `disconnect()` - Leave room (preserve Yjs for undo)
- `syncBoxToYjs(box)` - Sync single box to CRDT
- `syncConnectionsToYjs()` - Sync all connections to CRDT
- `_rebuildBoxesFromYjs()` - Rebuild mindMap from Yjs
- `_rebuildConnectionsFromYjs()` - Rebuild connections from Yjs

**Observer Pattern**:
```javascript
// Yjs → mindMap
yboxes.observe((event) => {
  if (event.transaction.origin === undoManager) {
    // Undo/redo path
  }
  _applyBoxFromYjs(boxId, data);
});

// mindMap → Yjs
MindMap.onBoxChange = (box) => {
  syncBoxToYjs(box);
};
```

#### 3. TextBox (`src/TextBox.js`)

**Responsibility**: Individual box representation.

**Key Properties**:
```javascript
{
  id: string,           // UUID
  x, y: number,         // Position
  text: string,         // Content
  width, height: number,// Dimensions
  imageUrl: string,     // Optional image
  // ... formatting properties
}
```

**Lifecycle**:
1. Created by user or loaded from storage
2. Added to mindMap.boxes[]
3. Synced to yboxes Map
4. Rendered on canvas
5. Changes propagate via callbacks

#### 4. Connection (`src/Connection.js`)

**Responsibility**: Arrow between boxes.

**Key Properties**:
```javascript
{
  fromBox: TextBox,  // Source reference
  toBox: TextBox,    // Target reference
  arrowSize: number  // Visual size
}
```

**Serialization**:
```javascript
{
  fromId: string,  // Box UUID (primary)
  toId: string,    // Box UUID (primary)
  from: number,    // Box index (legacy)
  to: number       // Box index (legacy)
}
```

**Critical**: Uses ID-based references for Yjs, maintains object references for rendering.

---

## State Management

### Three-Tier State Model

#### Tier 1: Yjs Document (Master)

**Location**: `CollaborationManager.ydoc`

**Structure**:
```javascript
ydoc {
  boxes: Y.Map<boxId, {
    x, y, text, width, height,
    imageUrl, backgroundColor,
    highlights, boldRanges, italicRanges
  }>,
  connections: Y.Array<{
    fromId, toId
  }>
}
```

**Authority**: 
- CRDT conflict resolution
- Undo/redo tracking
- Multi-user synchronization
- Offline operation support

**Persistence**: In-memory only (recreated on page load)

#### Tier 2: MindMap Object (UI State)

**Location**: `window.mindMap`

**Structure**:
```javascript
mindMap {
  boxes: [TextBox instances],
  connections: [Connection instances]
}
```

**Authority**:
- Rendering decisions
- User interactions
- Temporary UI state

**Persistence**: None (rebuilt from Yjs or localStorage)

#### Tier 3: localStorage (Backup)

**Location**: `localStorage[storageKey]`

**Structure**:
```javascript
{
  boxes: [{id, x, y, text, ...}],
  connections: [{fromId, toId, from, to}],
  lastModified: timestamp,
  name: filename
}
```

**Authority**:
- Offline persistence
- Session recovery
- Page refresh recovery

**Persistence**: Permanent (until cleared)

### State Synchronization

#### Forward Sync (User Action → Yjs)

```
User Edit
  ↓
mindMap.boxes[i].text = "new"
  ↓
mindMap.isSaved = false
  ↓
MindMap.onBoxChange(box)  [callback]
  ↓
CollaborationManager.syncBoxToYjs(box)
  ↓
ydoc.transact(() => {
  yboxes.set(boxId, boxData)
}, undoManager)  [origin for undo tracking]
  ↓
yboxes.observe fires
  ↓
[isSyncing flag prevents loop]
```

#### Reverse Sync (Yjs → mindMap)

```
Remote User Edit (or Undo)
  ↓
yboxes.observe fires
  ↓
isUndoRedo = event.transaction.origin === undoManager
  ↓
isSyncing = true
  ↓
_applyBoxFromYjs(boxId, data)
  ↓
mindMap.boxes.find(b => b.id === boxId).text = data.text
  ↓
isSyncing = false
```

#### Autosave Sync (mindMap → localStorage)

```
30-second timer
  ↓
if (!mindMap.isSaved && isPageVisible)
  ↓
mindMap.saveToLocalStorage()
  ↓
localStorage.setItem(storageKey, JSON.stringify(mindMap.toJSON()))
  ↓
mindMap.isSaved = true
```

---

## Data Flow Patterns

### Pattern 1: Create Box Offline

```
User: Double-click canvas
  ↓
new TextBox(x, y, "text")
  ↓
mindMap.addBox(box)
  ↓
mindMap.boxes.push(box)
  ↓
MindMap.onBoxChange(box)
  ↓
syncBoxToYjs(box)
  ↓
yboxes.set(box.id, data)
  ↓
[30s timer]
  ↓
localStorage save
```

### Pattern 2: Undo Box Deletion

```
User: Ctrl+Z
  ↓
undoManager.undo()
  ↓
yboxes.observe fires (origin = undoManager)
  ↓
_applyBoxFromYjs(boxId, data)
  ↓
new TextBox created
  ↓
mindMap.boxes.push(box)
  ↓
_rebuildConnectionsFromYjs()
  ↓
_syncConnectionsToYjsImpl()  [CRITICAL FIX]
  ↓
Remote users receive update
```

### Pattern 3: Join Collaboration Room

```
User: Click "Start Collaboration"
  ↓
if (mindMap.boxes.length > 0)
  show dialog: "Sync" or "Delete"?
  ↓
if "Sync":
  syncLocalToRoom()
  ↓
  _syncLocalToYjs()
  ↓
  for each box: yboxes.set()
  for each connection: yconnections.push()
  ↓
connect(roomName)
  ↓
WebsocketProvider syncs
  ↓
provider.on('synced')
  ↓
Yjs CRDT merges local + remote
  ↓
_rebuildBoxesFromYjs()
_rebuildConnectionsFromYjs()
  ↓
UI shows merged state
```

### Pattern 4: Page Refresh

```
Page Load
  ↓
if (!roomId)  [offline mode]
  ↓
  loadFromLocalStorage()
  ↓
  mindMap.fromJSON(data)
  ↓
  for each box: MindMap.onBoxChange(box)
  ↓
  for each box: syncBoxToYjs(box)
  ↓
  MindMap.onConnectionsChange()
  ↓
  syncConnectionsToYjs()
  ↓
  hasLoadedFromLocalStorage = true
  ↓
  clearUndoHistory()
```

---

## Collaboration Model

### CRDT-Based Synchronization

**Conflict-Free Replicated Data Type (CRDT)** guarantees eventual consistency without coordination.

**Yjs CRDT Properties**:
- **Causality Preservation**: Maintains operation order
- **Commutativity**: Operations commute (A→B = B→A)
- **Idempotency**: Applying operation twice = applying once
- **Associativity**: Grouping doesn't matter

**Example Conflict**:
```
User A (offline): Moves box to (100, 100)
User B (offline): Moves same box to (200, 200)
Both reconnect
  ↓
Yjs CRDT merges based on timestamps and client IDs
  ↓
Deterministic result (last writer wins with tie-breaking)
  ↓
Both users converge to same state
```

### Multi-User Synchronization

**Phases**:

1. **Cold Start** (empty room)
   - First user creates boxes
   - Synced to server
   - Other users download on join

2. **Hot Join** (active room)
   - New user downloads current state
   - Local changes merge via CRDT
   - Updates propagate to all clients

3. **Concurrent Edits**
   - Each user makes local changes
   - Changes sync via WebSocket
   - Yjs observers apply remote changes
   - UI updates in real-time

4. **Offline → Online**
   - Offline changes accumulate in Yjs
   - On reconnect, batch sync
   - CRDT resolves conflicts
   - No data loss

### Undo/Redo in Multi-User

**Challenge**: Undo in collaborative environment

**Yjs Solution**:
- `undoManager` tracks LOCAL changes only
- Undo reverses local operations
- Doesn't undo remote user changes
- Origin-based filtering

**Implementation**:
```javascript
undoManager = new Y.UndoManager([yboxes, yconnections], {
  trackedOrigins: new Set()  // Empty = track undoManager origin only
});

ydoc.transact(() => {
  yboxes.set(id, data);
}, undoManager);  // Tagged for undo tracking
```

**Critical Fix**: During undo, connections must sync back to Yjs so remote users see them.

---

## Critical Analysis

### Identified Issues

#### 1. **Dual State Problem**

**Issue**: State exists in THREE places (Yjs, mindMap, localStorage), creating synchronization complexity.

**Manifestation**:
- localStorage can get out of sync with Yjs
- Page refresh loads stale localStorage data
- Undo creates temporary inconsistency

**Current Mitigation**:
- `hasLoadedFromLocalStorage` flag prevents premature Yjs rebuild
- `isSyncing` flag prevents observer loops
- Explicit sync after undo

**Risk Level**: 🟡 MEDIUM - Mitigated but complex

**Recommendation**: Consider IndexedDB for Yjs state persistence (y-indexeddb provider).

#### 2. **Observer Ordering Non-Determinism**

**Issue**: Yjs observer firing order is non-deterministic based on Map insertion order.

**Manifestation**:
- `yconnections.observe` might fire before `yboxes.observe`
- Connection rebuild fails if boxes don't exist yet
- Undo path had this bug (now fixed)

**Current Mitigation**:
- yboxes observer rebuilds connections during undo
- yconnections observer skips during undo
- Explicit ordering in undo path

**Risk Level**: 🟢 LOW - Fixed in latest code

**Recommendation**: Document this extensively for future maintainers.

#### 3. **Autosave Window Data Loss**

**Issue**: 30-second autosave window means changes can be lost.

**Manifestation**:
- User edits text
- Closes browser before 30s
- Changes lost (only Yjs has them, in-memory)

**Current Mitigation**:
- `isSaved = false` triggers autosave
- Yjs persists in-memory during session
- Browser beforeunload could save

**Risk Level**: 🟡 MEDIUM - Inherent tradeoff

**Recommendation**: 
- Reduce autosave interval to 10s
- Add beforeunload save
- Consider y-indexeddb for Yjs persistence

#### 4. **Memory Growth (Yjs Document)**

**Issue**: Yjs document stores entire operation history for undo.

**Manifestation**:
- Long editing sessions accumulate operations
- Memory usage grows unbounded
- No garbage collection of undo history

**Current Mitigation**:
- `clearUndoHistory()` called after load
- Limited to session duration

**Risk Level**: 🟡 MEDIUM - Long sessions at risk

**Recommendation**: 
- Implement max undo stack depth
- Periodic history compaction
- Monitor memory in production

#### 5. **localStorage Quota Exceeded**

**Issue**: localStorage has 5-10MB limit per domain.

**Manifestation**:
- Large maps with images hit quota
- `QuotaExceededError` on save
- Data loss if not handled

**Current Mitigation**:
- Try/catch with retry after pruning
- Alert user to export
- Prune oldest caches

**Risk Level**: 🟢 LOW - Handled gracefully

**Recommendation**: Warn users about large images.

#### 6. **Connection Sync Gap (Multi-User Undo)**

**Issue**: Connections weren't syncing back to Yjs during undo.

**Manifestation**:
- User A undoes box deletion
- User A sees box + connections
- User B only sees box (no connections)

**Current Mitigation**:
- Fixed in commit 86a117b
- `_syncConnectionsToYjsImpl()` called after undo rebuild

**Risk Level**: 🟢 LOW - Fixed

**Recommendation**: Add integration test for multi-user undo.

#### 7. **Text Editing Race Condition**

**Issue**: Text edits are debounced (1s), creating potential race with deletion.

**Manifestation**:
- User types text
- Before 1s expires, user deletes box
- Debounced sync tries to sync deleted box

**Current Mitigation**:
- Text sync cleared on box deletion
- Box existence validated before sync

**Risk Level**: 🟢 LOW - Handled

**Recommendation**: None needed.

---

## Performance Considerations

### Bottlenecks

#### 1. **Observer Overhead**

**Measurement**:
- Each Yjs change triggers observer
- Observer rebuilds affected objects
- O(n) for boxes, O(n²) for connections (nested loop)

**Impact**:
- 100 boxes: ~100ms observer time
- 1000 boxes: ~1s+ observer time
- Not noticeable until 100+ boxes

**Optimization**:
- Differential updates (only changed boxes)
- Virtual scrolling for large maps
- Debounce observer callbacks

#### 2. **localStorage Serialization**

**Measurement**:
- `JSON.stringify()` is synchronous
- Blocks UI thread
- 100KB map: ~10ms
- 1MB map: ~100ms

**Impact**:
- Noticeable lag every 30s for large maps

**Optimization**:
- Use Web Workers for serialization
- Incremental saves (only changed items)
- Consider IndexedDB (async)

#### 3. **Canvas Rendering**

**Measurement**:
- Full redraw every frame if `isDirty`
- 100 boxes: ~16ms (60 FPS)
- 1000 boxes: ~160ms (6 FPS)

**Impact**:
- Smooth for < 100 boxes
- Laggy for > 500 boxes

**Optimization**:
- Spatial indexing (quadtree)
- Dirty rectangle tracking
- WebGL rendering

#### 4. **Network Synchronization**

**Measurement**:
- WebSocket messages for each change
- 50ms latency typical
- Bandwidth: ~1KB per box change

**Impact**:
- Real-time for < 10 concurrent users
- Noticeable lag with > 50 users

**Optimization**:
- Batch updates (not individual changes)
- Compression (gzip WebSocket)
- Server-side rate limiting

---

## Known Issues & Mitigations

### Issue Matrix

| Issue | Severity | Likelihood | Impact | Mitigation | Status |
|-------|----------|------------|--------|------------|--------|
| Autosave window data loss | Medium | Medium | Data loss | Reduce interval, beforeunload | Open |
| Memory growth (Yjs) | Medium | Low | Performance | Max undo depth | Open |
| localStorage quota | Low | Low | Data loss | Prune + alert | ✅ Fixed |
| Connection undo sync | High | High | Inconsistency | Sync after rebuild | ✅ Fixed |
| Observer ordering | Medium | Low | Crashes | Explicit ordering | ✅ Fixed |
| Text edit race | Low | Low | Crashes | Validate existence | ✅ Fixed |
| Offline→Online merge | Medium | Medium | Conflicts | CRDT handles | ✅ Works |

### Mitigation Strategies

#### Flag-Based Guards

1. **`hasLoadedFromLocalStorage`**
   - Prevents Yjs rebuild before localStorage sync
   - Set after initial load completes
   - Checked in `_rebuildConnectionsFromYjs()`

2. **`isSyncing`**
   - Prevents observer feedback loops
   - Set during observer execution
   - Checked at observer start

3. **`isUndoRedo`**
   - Distinguishes undo from normal sync
   - Detected from transaction origin
   - Enables special handling

4. **`isSaved`**
   - Triggers autosave timer
   - Set to false on any change
   - Set to true after save

#### Error Handling

```javascript
try {
  localStorage.setItem(key, JSON.stringify(data));
} catch (e) {
  if (e.name === 'QuotaExceededError') {
    pruneOldestCache();
    // Retry once
  } else {
    console.error('Save failed:', e);
    // Don't mark as saved
  }
}
```

---

## Recommendations

### Short-Term (Next Sprint)

1. **Reduce Autosave Interval**
   - Change from 30s to 10s
   - Reduces data loss window
   - Minimal performance impact

2. **Add beforeunload Save**
   ```javascript
   window.addEventListener('beforeunload', () => {
     mindMap.saveToLocalStorage();
   });
   ```

3. **Max Undo Stack Depth**
   ```javascript
   undoManager = new Y.UndoManager([yboxes, yconnections], {
     captureTimeout: 0,
     trackedOrigins: new Set(),
     maxStackSize: 50  // Limit history
   });
   ```

4. **Integration Tests**
   - Multi-user undo scenario
   - Offline→Online merge
   - Rapid connect/disconnect

### Medium-Term (Next Quarter)

1. **y-indexeddb Provider**
   - Persist Yjs state to IndexedDB
   - Eliminates localStorage sync complexity
   - Faster loads (async)
   - No 5MB limit

2. **Performance Monitoring**
   - Add telemetry for observer timing
   - Track autosave duration
   - Monitor memory growth
   - Alert on slow operations

3. **Differential Updates**
   - Only sync changed properties
   - Reduces network traffic
   - Improves large map performance

4. **Spatial Indexing**
   - Quadtree for box lookup
   - Faster connection rendering
   - Viewport culling

### Long-Term (Next Year)

1. **WebGL Rendering**
   - Replace p5.js with WebGL
   - 10x performance for large maps
   - Smooth for 1000+ boxes

2. **Operational Transformation**
   - Better text editing concurrency
   - Character-level merging
   - Reduced conflicts

3. **Server-Side Persistence**
   - Store maps on server
   - Cloud backup
   - Cross-device sync
   - Version history

4. **Mobile App**
   - Native iOS/Android
   - Better touch support
   - Offline-first architecture

---

## Appendix A: Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/sketch.js` | 5000+ | Main application, p5.js setup |
| `src/MindMap.js` | 3500+ | Domain model, business logic |
| `src/CollaborationManager.js` | 2500+ | Yjs integration, sync logic |
| `src/TextBox.js` | 800+ | Box component |
| `src/Connection.js` | 450+ | Connection component |
| `src/utils.js` | 400+ | Utilities, logging |
| `tests/unit/` | 400+ tests | Unit test suite |

---

## Appendix B: Glossary

- **CRDT**: Conflict-Free Replicated Data Type - Data structure that automatically resolves conflicts
- **Yjs**: JavaScript CRDT library for real-time collaboration
- **UndoManager**: Yjs component tracking reversible operations
- **Observer**: Callback function triggered on data changes
- **Transaction**: Atomic group of Yjs operations
- **Origin**: Transaction metadata for tracking source (e.g., undoManager)
- **WebSocket**: Bi-directional network protocol for real-time communication
- **localStorage**: Browser API for persistent key-value storage
- **p5.js**: JavaScript library for creative coding and canvas rendering

---

## Appendix C: Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-XX-XX | Initial release |
| 1.1.0 | 2026-02-11 | Connection rendering fixes, multi-user undo fix, comprehensive tests |

---

## Document Metadata

**Author**: Architecture Team  
**Reviewers**: Development Team  
**Status**: Living Document  
**Next Review**: Q2 2026  

---

*This architecture document should be updated with each major change to the system.*
