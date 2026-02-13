# Stale Reference Fix - Critical Collaboration UI Bug

## Issue
When creating a new collaboration room, the button remained green "Start Collaboration" instead of changing to blue "Copy Room Link", and the display name input field never appeared.

## Debug Evidence
Console logs showed the smoking gun:
```
[STATE] [UI] Updating collaboration state, isConnected: true
UIManager.js:435 [UIManager] layoutButtons() - isConnected: false
```

The global `collaborationManager.isConnected` was `true`, but UIManager was reading `false`.

## Root Cause

### The Problem: Stale Object References

1. **Initial Setup**:
   - UIManager is initialized once in sketch.js `setup()`
   - It receives a reference to `collaborationManager` and stores it as `this.collaborationManager`

2. **Room Creation**:
   - User clicks "Start Collaboration"
   - `shareSession()` creates a room
   - `initCollaboration()` is called
   - **A NEW CollaborationManager instance is created** (line ~300 in sketch.js)
   - The OLD manager is destroyed
   - Global `collaborationManager` variable now points to the NEW manager

3. **UI Update**:
   - `updateCollaborationState()` calls `layoutButtons()`
   - UIManager checks `this.collaborationManager.isConnected`
   - **But `this.collaborationManager` still points to the OLD (destroyed) manager!**
   - Old manager's `isConnected` = false (it was destroyed)
   - Button stays green, input stays hidden ❌

### Why This Happened

When JavaScript objects are passed by reference, storing that reference creates a snapshot at that moment in time. If the original object is replaced with a new instance, the stored reference becomes stale.

```javascript
// Initial state
let globalManager = new CollaborationManager(); // Instance A
uiManager.collaborationManager = globalManager; // Stores reference to A

// After room creation
globalManager = new CollaborationManager(); // NEW Instance B
// But uiManager.collaborationManager STILL points to old Instance A!
```

## Solution

Changed all UIManager methods to use the global `collaborationManager` variable instead of the cached `this.collaborationManager` reference:

```javascript
// Before: Always uses cached reference (can become stale)
const isConnected = this.collaborationManager && this.collaborationManager.isConnected;

// After: Uses current active manager
const activeManager = (typeof collaborationManager !== 'undefined') 
  ? collaborationManager 
  : this.collaborationManager;
const isConnected = activeManager && activeManager.isConnected;
```

### Fallback Strategy

The code still falls back to `this.collaborationManager` if the global variable is unavailable (e.g., in test environments or if the code structure changes). This provides robustness while fixing the production issue.

## Changes Made

### Files Modified
- `src/UIManager.js` - 5 locations updated

### Methods Updated

1. **showButtons()** - Line ~356
   - Checks global manager for connection state
   - Updates button text/color based on actual state

2. **layoutButtons()** - Line ~432
   - Checks global manager for connection state
   - Positions button and input correctly based on actual state

3. **attachDisplayNameInputHandlers() - blur handler** - Line ~201
   - Uses global manager to update username on blur

4. **attachDisplayNameInputHandlers() - input handler** - Line ~218
   - Uses global manager for debounced username updates

5. **layoutButtons() - username pre-population** - Line ~520
   - Uses global manager to get current username

## Testing

### Before Fix
```
[STATE] [UI] Updating collaboration state, isConnected: true
[UIManager] layoutButtons() - isConnected: false
[UIManager] Setting button to "Start Collaboration" (green)
[UIManager] Hiding display name input
```
Result: Button stayed green, no input ❌

### After Fix
```
[STATE] [UI] Updating collaboration state, isConnected: true
[UIManager] layoutButtons() - isConnected: true manager: active
[UIManager] Setting button to "Copy Room Link" (blue)
[UIManager] Showing display name input
```
Result: Button turns blue, input appears ✅

## Lessons Learned

### 1. Be Careful with Object References
When storing references to objects that can be recreated, always consider:
- Can this object be replaced with a new instance?
- Should I store the reference or get it fresh each time?
- Is there a global source of truth I should check?

### 2. Global State as Source of Truth
In this architecture:
- Global `collaborationManager` variable = current active manager
- UIManager's `this.collaborationManager` = snapshot from initialization
- Always use the global variable for current state

### 3. Debug Logging is Essential
The comprehensive logging added in previous commits made this bug immediately obvious. Without logs showing both `isConnected: true` (global) and `isConnected: false` (UIManager), this would have been much harder to diagnose.

### 4. Test Manager Recreation
Future testing should include scenarios where managers are recreated:
- Creating a room
- Switching rooms
- Disconnecting and reconnecting
- Any operation that creates a new manager instance

## Alternative Solutions Considered

### Option 1: Update UIManager's Reference
Instead of checking the global, update `this.collaborationManager` when the manager changes:
```javascript
// When creating new manager
collaborationManager = new CollaborationManager();
if (uiManager) {
  uiManager.collaborationManager = collaborationManager;
}
```

**Rejected because**: This requires modifying all places where managers are created. Using the global variable is simpler and more robust.

### Option 2: Don't Recreate Managers
Reuse the same CollaborationManager instance instead of creating new ones.

**Rejected because**: The architecture requires fresh managers for room switches. Changing this would be a much larger refactor.

### Option 3: Pass Manager to Every Method
Don't store manager reference, pass it as parameter:
```javascript
uiManager.updateCollaborationState(collaborationManager);
```

**Rejected because**: Would require changing many method signatures. Using the global is simpler.

## Impact

### Fixed Behaviors
✅ Button changes from green→blue when entering room
✅ Button text changes from "Start Collaboration"→"Copy Room Link"
✅ Display name input appears when connected
✅ Display name input is pre-populated with username
✅ Display name changes propagate to other users

### Code Quality
✅ Added helpful debug logging showing active manager
✅ Robust fallback to cached reference if global unavailable
✅ Clear comments explaining why global is used
✅ Consistent pattern across all manager access points

## Commit
- Commit: bf51fe2
- Message: "CRITICAL FIX: Use global collaborationManager instead of cached reference to fix stale state issue"
- Files changed: src/UIManager.js (24 insertions, 14 deletions)
