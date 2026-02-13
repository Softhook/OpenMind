# Menu System Fix - Complete Documentation

## Problem Statement

The menu system had critical issues:
1. **Uneven button spacing** - Buttons were overlapping or poorly spaced
2. **Wrong button visible in collaboration room** - "Start Collaboration" button shown when already in a room
3. **Display name input missing** - The name input field wasn't visible in collaboration rooms
4. **Poor user experience** - Users couldn't change their name in rooms

## Root Causes

### 1. Incorrect p5.js API Usage
**Problem:** Line 418 in layoutButtons()
```javascript
// WRONG - p5.js style() takes 2 params, not 3
btn.style('visibility', 'hidden', 'display', 'inline-block');
```

**Fix:**
```javascript
// CORRECT - separate calls
btn.style('visibility', 'hidden');
btn.style('display', 'inline-block');
```

### 2. Invite Button Always Visible
**Problem:** The "Start Collaboration" button was always added to the layout, even when already connected to a room.

**Fix:** Check connection state and conditionally add to layout:
```javascript
const isConnected = this.collaborationManager && this.collaborationManager.isConnected;

// Add invite button to layout only if NOT connected
if (!isConnected) {
  buttonsToLayout.push(this.inviteButton);
}
```

### 3. Display Name Input Not Replacing Invite Button
**Problem:** Display name input was positioned AFTER the invite button, and both could be visible simultaneously.

**Fix:** Make them mutually exclusive:
```javascript
if (isConnected) {
  // When connected: hide invite button, show display name input
  this.inviteButton.style('display', 'none');
  this.displayNameInput.style('display', 'inline-block');
  // Position display name input where invite button would be
} else {
  // When not connected: show invite button, hide display name input
  this.inviteButton.style('display', 'inline-block');
  this.displayNameInput.style('display', 'none');
}
```

### 4. showButtons() Not Respecting State
**Problem:** showButtons() always showed invite button regardless of connection state.

**Fix:** Check connection state and show appropriate element:
```javascript
// Show invite button only when NOT connected
if (this.inviteButton) {
  if (isConnected) {
    this.inviteButton.style('display', 'none');
  } else {
    this.inviteButton.style('display', 'inline-block');
  }
}

// Show display name input only when connected
if (this.displayNameInput) {
  if (isConnected) {
    this.displayNameInput.style('display', 'inline-block');
  } else {
    this.displayNameInput.style('display', 'none');
  }
}
```

## Expected Behavior

### When NOT in Collaboration Room
Menu should show (left to right):
1. Load
2. Save
3. Import Text
4. Export PNG
5. Export PDF
6. Export Text
7. Keyboard Controls
8. **Start Collaboration** (green button)

The display name input should be **hidden**.

### When IN Collaboration Room
Menu should show (left to right):
1. Load
2. Save
3. Import Text
4. Export PNG
5. Export PDF
6. Export Text
7. Keyboard Controls
8. **[Your Name]** (text input field)

The "Start Collaboration" button should be **hidden**.

## Technical Implementation

### Changes to layoutButtons()

1. **Check connection state at start:**
```javascript
const isConnected = this.collaborationManager && this.collaborationManager.isConnected;
```

2. **Conditionally add invite button to layout:**
```javascript
const buttonsToLayout = [
  this.loadButton,
  this.saveButton,
  this.importTextButton,
  this.exportPNGButton,
  this.exportPDFButton,
  this.exportTextButton,
  this.keyboardControlsButton
];

// Add invite button only if NOT connected
if (!isConnected) {
  buttonsToLayout.push(this.inviteButton);
}
```

3. **Handle visibility with correct API:**
```javascript
buttonsToLayout.forEach(btn => {
  if (btn && btn.elt) {
    originalStates.set(btn, {
      display: btn.elt.style.display,
      visibility: btn.elt.style.visibility
    });
    btn.style('visibility', 'hidden');  // Separate call
    btn.style('display', 'inline-block');  // Separate call
  }
});
```

4. **Mutually exclusive invite button and display name input:**
```javascript
if (isConnected) {
  // Hide invite button
  if (this.inviteButton) {
    this.inviteButton.style('display', 'none');
  }
  
  // Show and position display name input
  if (this.displayNameInput) {
    this.displayNameInput.style('width', `${inputWidth}px`);
    this.displayNameInput.style('display', 'inline-block');
    this.displayNameInput.position(x, buttonY + yNudge);
    x += inputWidth + buttonGap;
    
    // Pre-populate with current username
    const currentName = this.collaborationManager.getUserName();
    if (currentName && this.displayNameInput.value() !== currentName) {
      this.displayNameInput.value(currentName);
    }
  }
} else {
  // Show and position invite button
  if (this.inviteButton) {
    this.inviteButton.style('background-color', '#4caf50');
    this.inviteButton.html('Start Collaboration');
    positionButton(this.inviteButton);
  }
  
  // Hide display name input
  if (this.displayNameInput) {
    this.displayNameInput.style('display', 'none');
  }
}
```

5. **Restore display state properly:**
```javascript
buttonsToLayout.forEach(btn => {
  if (btn && btn.elt) {
    btn.style('visibility', 'visible');
    // Restore display state based on menu visibility
    if (!this.menuIsVisible) {
      btn.style('display', 'none');
    }
  }
});
```

### Changes to showButtons()

Made the visibility logic consistent with layoutButtons():
```javascript
const isConnected = this.collaborationManager && this.collaborationManager.isConnected;

// Always show these buttons
if (this.loadButton) this.loadButton.style('display', 'inline-block');
// ... (other always-visible buttons)

// Show invite button only when NOT connected
if (this.inviteButton) {
  if (isConnected) {
    this.inviteButton.style('display', 'none');
  } else {
    this.inviteButton.style('display', 'inline-block');
  }
}

// Show display name input only when connected
if (this.displayNameInput) {
  if (isConnected) {
    this.displayNameInput.style('display', 'inline-block');
  } else {
    this.displayNameInput.style('display', 'none');
  }
}
```

## State Transitions

### Entering a Collaboration Room
1. User clicks "Start Collaboration" button
2. Room join dialog appears
3. User confirms room join
4. `collaborationManager.isConnected` becomes `true`
5. sketch.js calls `uiManager.updateCollaborationState()`
6. `updateCollaborationState()` calls `layoutButtons()`
7. layoutButtons() detects `isConnected === true`
8. Invite button hidden, display name input shown and positioned
9. Display name input pre-populated with current username

### Leaving a Collaboration Room
1. User disconnects from room
2. `collaborationManager.isConnected` becomes `false`
3. sketch.js calls `uiManager.updateCollaborationState()`
4. `updateCollaborationState()` calls `layoutButtons()`
5. layoutButtons() detects `isConnected === false`
6. Display name input hidden, invite button shown and positioned
7. Button text reset to "Start Collaboration"

## Verification

### Manual Testing Steps
1. **Test non-connected state:**
   - Load the app (no room hash in URL)
   - Hover over left side to show menu
   - Verify all buttons visible with even spacing
   - Verify "Start Collaboration" button is visible
   - Verify display name input is NOT visible

2. **Test entering collaboration:**
   - Click "Start Collaboration"
   - Enter room name and confirm
   - Verify "Start Collaboration" button disappears
   - Verify display name input appears in its place
   - Verify display name input shows current username

3. **Test display name editing:**
   - Click in display name input
   - Type a new name
   - Verify name updates in real-time (debounced)
   - Verify other users see name change

4. **Test leaving collaboration:**
   - Disconnect from room
   - Verify display name input disappears
   - Verify "Start Collaboration" button reappears
   - Verify button spacing remains even

## Button Spacing Calculation

The spacing is now calculated dynamically based on actual button widths:

```
startX = 40px (configurable)
buttonGap = 5px (configurable)

Button positions:
- Load: 40px (width measured)
- Save: Load.x + Load.width + gap
- Import Text: Save.x + Save.width + gap
- Export PNG: ImportText.x + ImportText.width + gap
- ... (and so on)
```

Each button's actual `offsetWidth` is measured after temporarily making them visible (but hidden with `visibility: hidden`), ensuring accurate spacing regardless of:
- Browser rendering differences
- Font size changes
- Button text length
- CSS styling variations

## Files Changed

- `src/UIManager.js`
  - layoutButtons() method (lines 391-524)
  - showButtons() method (lines 350-387)

## Related Issues

This fix also resolves:
- Button overlap issues
- Menu hover detection accuracy
- Proper state synchronization between UI and collaboration manager
- User name display and editing in collaboration sessions

## Future Improvements

1. **Add visual feedback** for display name changes
2. **Add validation** for display name (length, characters)
3. **Add "Share Link" button** when connected (copy room URL to clipboard)
4. **Add room info display** (room name, participant count)
5. **Add disconnect button** when in room
