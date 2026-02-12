# Critical Review: Sync Status Indicator

## Current State Analysis
The sync indicator currently uses a 3-color system to communicate the application's state:
- **Green**: Fully Synced (Collab) or Saved (Local).
- **Yellow**: Syncing/Connecting (Collab) or Unsaved Changes (Local).
- **Red**: Error/Incompatible (Collab).

## Identified Issues

### 1. The "False Green" Offline Risk (Critical)
**Scenario**: User is in a collaboration room. The internet connection drops.
**Current Behavior**:
1. `collaborationManager` report status `disconnected`.
2. `isConnected` becomes `false`.
3. The `drawSaveIndicator` logic falls causes the `if (collaborationManager.isConnected)` check to fail.
4. Logic falls back to the `else` block (Local Mode).
5. Since autosave is running locally, `mindMap.isSaved` is likely `true`.
6. **Result**: Indicator turns **GREEN**.
**Impact**: The user sees a green light and assumes their peers can see their changes. In reality, they are offline. This is a critical accumulation of "split-brain" state that will cause conflicts later.

### 2. Ambiguity of "Yellow"
**Scenario**: Indicator is Yellow.
**Ambiguity**: Is the app:
- Trying to connect to a slow server? (Action: Wait)
- actively syncing large data? (Action: Wait)
- just holding unsaved local changes? (Action: Manual Save?)
While "Yellow = Working" is a general convention, indistinguishable states can lead to user anxiety or inaction.

### 3. "Red" Usage Consistency
**Current**: Red is only for `incompatible` or `error` in Collab mode.
**Gap**: If local save fails (e.g., specific browser storage limits), it might not trigger a visual alert if `mindMap.isSaved` logic doesn't explicitly account for save failures (it usually just stays false/Yellow).

### 4. Accessibility
**Issue**: A color-only indicator is inaccessible to users with color blindness (specifically Red/Green and Blue/Yellow deficiencies).
**Recommendation**: Add a text tooltip, changing icon shape, or a secondary visual cue (e.g., an icon inside the circle, or a text label next to it).

## Recommendations for Immediate Refactor

1.  **Differentiate "Offline" from "Local"**:
    If `collaborationManager` exists (implies user *intends* to be collaborating) but `isConnected` is false, the indicator must be **RED** or **GREY** (with a slash?), not Green. Green must be reserved for "Confirmed Live Connection".

2.  **Explicit "Disconnected" State**:
    Add logic to handle `!isConnected` inside the collaboration block:
    ```javascript
    if (collaborationManager) {
        if (!collaborationManager.isConnected) {
            return RED; // "Offline - Not Syncing"
        }
        // ... rest of connected logic
    }
    ```

3.  **Tooltip Integration**:
    Use the `title` attribute of the canvas or a dedicated DOM overlay to show the specific string status (e.g., "Disconnected", "Syncing...", "Saved Locally").
