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

The game includes full multiplayer support through the CollaborationManager's awareness protocol. When connected to a collaboration room:

- **Player Ships**: Other players appear as ships colored with their default user color (the color assigned to them in the collaboration session)
- **Player Labels**: Each remote ship displays the player's name above it for easy identification
- **Bullet Colors**: 
  - Your own bullets are drawn in **black**
  - Enemy bullets are drawn in **red**
- **Collision Detection**: Full collision detection between ships and bullets
- **Real-time Sync**: Player positions, velocities, angles, and bullets are synchronized in real-time
- **Player Count**: The number of active players is shown in the top right corner
- **Zero Overhead**: When the game is not active, it consumes no resources

### How It Works

The thrust game uses Yjs awareness protocol (the same system used for cursor presence) to broadcast game state:
- Each player's position, velocity, angle, and alive status
- All active bullets with their positions and velocities
- Updates are throttled to ~100ms intervals to balance responsiveness and bandwidth

When you fire a bullet, it appears immediately for you and is synced to other players. Remote players see your ship in your assigned collaboration color, making it easy to identify who's who in the game.

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
