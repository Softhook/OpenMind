# Thrust Game Easter Egg

## Overview

OpenMind includes a hidden Easter egg: a mini thrust-based game that can be activated with a keyboard shortcut. This feature is designed to be fun without interfering with the main mind mapping application.

## How to Play

### Starting the Game

Press **Shift+T** to toggle the game on/off.

### Controls

- **Arrow Keys**: Control your ship
  - **Up Arrow**: Thrust forward
  - **Down Arrow**: Thrust backward (half power)
  - **Left Arrow**: Rotate left
  - **Right Arrow**: Rotate right
- **Spacebar**: Fire bullets
- **Shift+T**: Exit game and return to mind map

### Gameplay

- Navigate your cyan-colored ship through space
- Use thrust to counteract gravity and control your movement
- Fire bullets to shoot at other players (in multiplayer mode)
- Avoid getting hit by other players' bullets
- Your ship wraps around the screen edges
- After being hit, you respawn after a 3-second countdown

### Physics

The game features realistic physics simulation:
- **Gravity**: Constant downward force pulls your ship
- **Thrust**: Accelerates your ship in the direction it's facing
- **Drag**: Velocity naturally decreases over time
- **Max Speed**: Ship velocity is capped to prevent runaway acceleration
- **Rotation**: Ship can rotate to change thrust direction

### Scoring

- **Score**: Number of enemy ships you've hit
- **Deaths**: Number of times you've been destroyed

## Multiplayer Support

The game is designed with multiplayer support in mind. When connected to a collaboration room:

- Other players appear as red ships
- You can shoot and hit other players
- Remote players' bullets can destroy your ship
- Player count is shown in the top right

**Note**: Full multiplayer synchronization is a work in progress. The infrastructure is in place but requires additional implementation in the CollaborationManager.

## Technical Details

### Implementation

The game is implemented as a separate class (`ThrustGame.js`) that:
- Has its own physics engine and game loop
- Completely takes over rendering when active
- Handles its own keyboard input
- Doesn't interfere with mind map state
- Can integrate with the existing CollaborationManager

### Design Decisions

1. **Separate File**: Keeps the Easter egg isolated from core functionality
2. **Toggle Activation**: Easy to turn on/off without disrupting workflow
3. **No State Pollution**: Game state is completely independent of mind map
4. **Minimal Dependencies**: Only uses p5.js (already loaded) and Utils
5. **Multiplayer Ready**: Structure supports future multiplayer expansion

### Performance

- Game runs at 60 FPS (browser's requestAnimationFrame)
- Physics updates every frame
- Multiplayer broadcasts throttled to ~100ms intervals
- No performance impact when game is inactive

## Known Limitations

1. **Single Screen**: Game doesn't support multiple browser windows
2. **No Persistence**: Score resets when game is toggled off
3. **Basic Multiplayer**: Full multiplayer sync not yet implemented
4. **No Obstacles**: No terrain or obstacles (pure space combat)
5. **No Powerups**: No items or powerups to collect

## Future Enhancements

Possible future additions:
- Full multiplayer synchronization
- Obstacles and terrain
- Powerups and weapons variety
- Leaderboard persistence
- Sound effects
- Particle effects for explosions
- Team modes
- Different ship types

## Accessibility

- Keyboard-only controls (no mouse required)
- Clear on-screen instructions
- High contrast colors (cyan player on dark background)
- Respawn invulnerability with visual feedback (flashing)

## Browser Compatibility

Works in all modern browsers that support:
- p5.js (Canvas API)
- ES6+ JavaScript features
- Standard keyboard events

Tested on:
- Chrome/Edge (Chromium)
- Firefox
- Safari

## Credits

Created as an Easter egg feature for the OpenMind mind mapping application.
Inspired by classic thrust-based space games like Asteroids and Thrust.
