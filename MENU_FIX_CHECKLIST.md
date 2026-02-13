# Menu System Fix - Verification Checklist

## Testing Checklist

### Test 1: Not Connected State
- [ ] Load app without room hash in URL
- [ ] Hover over left edge to show menu
- [ ] Verify buttons appear in order:
  - [ ] Load
  - [ ] Save
  - [ ] Import Text
  - [ ] Export PNG
  - [ ] Export PDF
  - [ ] Export Text
  - [ ] Keyboard Controls
  - [ ] **Start Collaboration** (green button)
- [ ] Verify spacing is even between all buttons (no overlap)
- [ ] Verify display name input is NOT visible
- [ ] Take screenshot for documentation

### Test 2: Entering Collaboration
- [ ] Click "Start Collaboration" button
- [ ] Enter room name (e.g., "test-room-123")
- [ ] Click confirm/join
- [ ] Wait for connection to establish
- [ ] Hover over left edge to show menu
- [ ] Verify "Start Collaboration" button is GONE
- [ ] Verify display name input IS visible in its place
- [ ] Verify display name input shows current username
- [ ] Verify spacing is still even
- [ ] Take screenshot for documentation

### Test 3: Display Name Editing
- [ ] Click in display name input field
- [ ] Type a new name (e.g., "Test User")
- [ ] Press Enter or click outside field
- [ ] Verify name updates (check browser console for collab messages)
- [ ] If testing with another user:
  - [ ] Verify other user sees the name change

### Test 4: Menu Hover Behavior (Connected)
- [ ] Mouse away from menu (should hide)
- [ ] Mouse back over left edge
- [ ] Verify menu shows with display name input (not invite button)
- [ ] Click in display name input
- [ ] Mouse away from menu (should stay visible while input focused)
- [ ] Click outside input
- [ ] Mouse away from menu (should hide)

### Test 5: Window Resize (Connected)
- [ ] Resize browser window
- [ ] Hover over left edge to show menu
- [ ] Verify buttons still properly spaced
- [ ] Verify display name input still visible
- [ ] Verify no buttons overlapping

### Test 6: Leaving Collaboration
- [ ] While connected, disconnect from room (or close and reopen app)
- [ ] Verify connection status changes to disconnected
- [ ] Hover over left edge to show menu
- [ ] Verify display name input is GONE
- [ ] Verify "Start Collaboration" button IS visible again
- [ ] Verify spacing is even
- [ ] Take screenshot for documentation

### Test 7: Rapid State Changes
- [ ] Connect to room
- [ ] Immediately disconnect
- [ ] Reconnect
- [ ] Verify UI updates correctly each time
- [ ] Verify no UI artifacts or stuck states

### Test 8: Room URL Loading
- [ ] Copy room URL while connected
- [ ] Close browser tab
- [ ] Open new tab and paste room URL
- [ ] Wait for auto-connection
- [ ] Hover over left edge
- [ ] Verify display name input is visible (not invite button)

## Expected Results Summary

### Not Connected
```
Menu: [Load] [Save] [Import Text] [Export PNG] [Export PDF] [Export Text] [Keyboard Controls] [Start Collaboration]
```
- All buttons visible
- Even spacing (no overlap)
- Display name input hidden

### Connected
```
Menu: [Load] [Save] [Import Text] [Export PNG] [Export PDF] [Export Text] [Keyboard Controls] [Your Name      ]
                                                                                                 ^^^^^^^^^^^^^^
                                                                                                 input field
```
- All buttons visible except invite button
- Display name input visible in place of invite button
- Even spacing (no overlap)
- Input pre-populated with current username

## Common Issues to Watch For

### Issue: Buttons Overlapping
**Symptom**: Buttons appear on top of each other
**Cause**: layoutButtons() not being called or measurement failing
**Solution**: Check console for errors, verify layoutButtons() is called after initialization

### Issue: Both Invite Button and Display Name Visible
**Symptom**: Both elements visible simultaneously
**Cause**: showButtons() not checking isConnected properly
**Solution**: Verify collaborationManager.isConnected returns correct value

### Issue: Display Name Input Not Visible When Connected
**Symptom**: Connected to room but input doesn't appear
**Cause**: isConnected check failing or showButtons() not called
**Solution**: Check collaborationManager.isConnected value, verify updateCollaborationState() is called

### Issue: Uneven Spacing After Resize
**Symptom**: Buttons spread out or overlap after window resize
**Cause**: handleResize() not calling layoutButtons()
**Solution**: Verify windowResized() in sketch.js calls uiManager.handleResize()

## Developer Console Checks

### Connection State
```javascript
// In browser console:
collaborationManager.isConnected
// Should return true when connected, false otherwise
```

### Button Positions
```javascript
// Check if buttons are positioned correctly:
uiManager.loadButton.elt.getBoundingClientRect()
uiManager.saveButton.elt.getBoundingClientRect()
// Compare x positions - should increase with proper gap
```

### Display Name Input
```javascript
// Check input visibility:
uiManager.displayNameInput.elt.style.display
// Should be 'inline-block' when connected, 'none' when not

// Check input value:
uiManager.displayNameInput.value()
// Should match collaborationManager.getUserName()
```

## Automated Verification

### Code Checks
```bash
# Verify syntax
node -c src/UIManager.js

# Check for style() calls with 3 parameters (should be none)
grep -n "\.style('.*', '.*', '.*')" src/UIManager.js
# Should return no results

# Check that isConnected is used in layoutButtons
grep -A5 "layoutButtons()" src/UIManager.js | grep "isConnected"
# Should find usage
```

## Screenshots Required

1. **Not connected state** - Full menu visible with "Start Collaboration"
2. **Connected state** - Full menu visible with display name input
3. **Side-by-side comparison** - Before and after connecting

## Sign-off

- [ ] All tests completed
- [ ] All screenshots taken
- [ ] No console errors
- [ ] No visual artifacts
- [ ] Proper state transitions
- [ ] Documentation reviewed

**Tested by:** _______________  
**Date:** _______________  
**Browser:** _______________  
**Result:** ✅ Pass / ❌ Fail

## Notes
_Add any additional observations, issues found, or suggestions:_

