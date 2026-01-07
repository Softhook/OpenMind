# Sync Fix Testing Guide

## Problem Description
Before this fix, browsers could show `provider.synced: true` but have mismatched states:
- Browser 1: Yjs boxes=0, Local boxes=4
- Browser 2: Yjs boxes=4, Local boxes=9

This happened because:
1. The sync event handler only ran on initial sync transitions
2. After the initial sync, no mechanism existed to detect and fix mismatches
3. Local changes could accumulate without being synced to Yjs

## Solution
Added a periodic consistency check that:
- Runs every 3 seconds when connected and synced
- Compares Yjs box IDs vs Local box IDs
- Automatically reconciles mismatches by:
  - Adding missing boxes from Yjs to Local
  - Adding missing boxes from Local to Yjs
  - Rebuilding connections

## How to Test

### Setup
1. Start the application on a local server:
   ```bash
   python3 -m http.server 8000
   ```

2. Open two browser windows/tabs to:
   - http://localhost:8000/#room=testroom

### Test Scenario 1: Initial Sync with Local Data
1. In Browser 1:
   - Clear localStorage (open DevTools > Application > Local Storage > Clear)
   - Refresh the page
   - Create 4 boxes manually
   - Note: These will be in localStorage

2. In Browser 2:
   - Clear localStorage
   - Refresh the page
   - Create 9 boxes manually

3. Both browsers join the room:
   - In both browsers, add `#room=testroom` to the URL and refresh
   - Wait 5-10 seconds

4. Check sync state in both browsers:
   - Open DevTools Console
   - Type: `collab.debug()`
   - Look for "Consistency check detected mismatch!" warnings
   - Within 3-6 seconds, both browsers should reconcile
   - Run `collab.debug()` again to verify:
     - Yjs boxes count should match Local boxes count in both browsers
     - Box IDs should match (no "In Yjs ONLY" or "In Local ONLY")

### Test Scenario 2: Adding Boxes After Sync
1. Both browsers already in the same room and synced
2. Browser 1: Add 2 new boxes
3. Wait 3-6 seconds (consistency check interval)
4. Browser 2: Run `collab.debug()`
   - Should see the 2 new boxes from Browser 1
5. Browser 1: Run `collab.debug()`
   - All boxes should be in sync

### Test Scenario 3: Network Reconnection
1. Both browsers synced
2. Browser 1: Open DevTools > Network tab > Go offline
3. Browser 1: Add 3 boxes (only in local state)
4. Browser 1: Go back online
5. Wait 3-6 seconds after reconnection
6. Run `collab.debug()` in both browsers
   - Should see automatic reconciliation
   - All boxes should sync

### Expected Console Output

When the consistency check detects a mismatch:
```
CollaborationManager: Consistency check detected mismatch!
  Boxes only in Yjs: 0
  Boxes only in Local: 5
  Reconciling...
CollaborationManager: Consistency check reconciliation complete
```

After reconciliation, running `collab.debug()` should show:
```
📦 Boxes
Yjs boxes: 9
Local boxes: 9
✅ Box IDs match
```

### Verification Checklist
- [ ] Both browsers show matching Yjs and Local box counts
- [ ] No "In Yjs ONLY" or "In Local ONLY" warnings
- [ ] New boxes created in one browser appear in the other within 3-6 seconds
- [ ] Consistency check logs appear when mismatches are detected
- [ ] Consistency check stops when disconnected
- [ ] No performance issues or console errors

### Debug Commands
```javascript
// Check current sync state
collab.debug()

// Check if consistency check is running
collab.consistencyCheckTimer !== null

// Manually trigger consistency check
collab._performConsistencyCheck()

// Check Yjs state
collab.yboxes.size
collab.mindMap.boxes.length
```

## Notes
- The consistency check runs every 3 seconds when synced
- It only runs when `isConnected && provider.synced && !isSyncing`
- The check is automatically stopped when disconnected
- Reconciliation happens bidirectionally (Yjs ↔ Local)
