# Manual Testing Guide for Thrust Mode Fixes

This document describes how to manually verify the thrust mode fixes.

## Issues Fixed

### Issue 1: Explosion Visibility When Shooting Remote Player
**Problem**: When a player shoots a remote player, the score increments but no explosion is visible, and the respawn is not visible.

**Fix**: Create explosion immediately when local bullet hits remote player, providing instant visual feedback.

### Issue 2: Remote Player Visibility
**Problem**: Remote ships are only visible if the local player is also in thrust mode.

**Fix**: Remove throttling from awareness listener to ensure immediate visibility of remote players.

## Test Setup

You'll need two browser windows or two different computers to test multiplayer features:

1. Open the application in Browser A: `file:///path/to/OpenMind/index.html#room=test-thrust`
2. Open the application in Browser B: `file:///path/to/OpenMind/index.html#room=test-thrust`

## Test Cases

### Test Case 1: Remote Player Visibility (Issue 2)

**Steps:**
1. Open Browser A - DO NOT enter thrust mode yet (don't press Shift+T)
2. Open Browser B - Press Shift+T to enter thrust mode
3. In Browser A, verify you can see Browser B's spaceship moving around

**Expected Result:**
- Browser A should see Browser B's spaceship even though Browser A is not in thrust mode
- The spaceship should be visible immediately (within a few milliseconds)

**Before Fix:**
- Browser B's spaceship would not be visible to Browser A unless Browser A also entered thrust mode
- There could be a delay of up to 500ms before the spaceship appeared

### Test Case 2: Explosion When Shooting Remote Player (Issue 1)

**Steps:**
1. Both Browser A and Browser B enter thrust mode (Shift+T)
2. In Browser A, navigate close to Browser B's spaceship
3. In Browser A, shoot at Browser B's spaceship (Spacebar)
4. Watch for the explosion animation

**Expected Result:**
- When Browser A's bullet hits Browser B's spaceship:
  - An explosion should appear immediately at the impact location
  - The explosion should be a red expanding circle that fades out
  - Browser A's score should increment

**Before Fix:**
- The score would increment but no explosion would appear locally
- The explosion would only be created after Browser B's client detected the hit and updated their state (network round-trip delay)

### Test Case 3: Local Player Death and Respawn

**Steps:**
1. Both browsers in thrust mode
2. In Browser B, shoot at Browser A's spaceship
3. When Browser A gets hit, observe:
   - Explosion animation at Browser A's death location
   - "Respawning in X..." countdown message
   - After 3 seconds, Browser A's spaceship respawns

**Expected Result:**
- Explosion should be visible on Browser A's screen
- Countdown should be visible in the center of the screen
- After 3 seconds, the spaceship should respawn at a new location

### Test Case 4: Remote Player Death Explosion

**Steps:**
1. Both browsers in thrust mode
2. Browser A shoots Browser B
3. On Browser B's side, they will die and see their own explosion
4. On Browser A's side, verify you see TWO explosions:
   - One immediate explosion when your bullet hits (from local creation)
   - One when Browser B's state updates to dead (from remote state update)

**Expected Result:**
- Browser A should see an explosion immediately when their bullet hits
- There should be no delay in visual feedback

## Controls

- **Shift+T**: Toggle thrust mode on/off
- **Arrow Keys**: Rotate and thrust
  - Left/Right: Rotate ship
  - Up: Thrust forward
  - Down: Thrust backward
- **Spacebar**: Fire bullet
- **Score Display**: Top-left corner shows score and deaths

## Troubleshooting

If remote players are not visible:
1. Check browser console for errors
2. Verify both browsers are in the same room (same URL hash)
3. Try refreshing both browsers
4. Check network connectivity

If explosions are not visible:
1. Verify you're within viewport (explosion needs to be on screen)
2. Check browser console for rendering errors
3. Verify the game is running (should see other animations like ship movement)

## Success Criteria

- ✅ Remote players visible immediately when they enter thrust mode, even if local player is not in thrust mode
- ✅ Explosions appear immediately when shooting remote players
- ✅ Local player death shows explosion and respawn countdown
- ✅ No delays or missing visual feedback
- ✅ All existing thrust mode functionality still works correctly
