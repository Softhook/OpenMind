/**
 * ThrustGame.js - Easter egg mini-game implementation
 * 
 * A simple thrust-based physics game where players control a ship using arrow keys
 * and fire bullets with spacebar. Designed to be toggleable with Shift+T and
 * support multiplayer gameplay in collaborative rooms.
 * 
 * Key Features:
 * - Physics-based player movement with thrust and gravity
 * - Arrow key controls for ship navigation
 * - Spacebar to fire bullets
 * - Collision detection between bullets and players
 * - Multiplayer support via CollaborationManager
 * - Designed to not interfere with main application
 * 
 * Dependencies:
 * - p5.js for rendering
 * - CollaborationManager for multiplayer (optional)
 */

class ThrustGame {
  // ============================================================================
  // STATIC CONSTANTS
  // ============================================================================

  static PHYSICS = {
    GRAVITY: 0.03,                 // Downward acceleration (pixels per frame^2)
    THRUST: 0.2,                   // Thrust acceleration magnitude (pixels per frame^2)
    ROTATION_SPEED: 0.08,          // Angular velocity for rotation (radians per frame)
    MAX_SPEED: 8,                  // Maximum velocity magnitude (pixels per frame)
    DRAG: 0.98,                    // Velocity dampening per frame (0-1, 1 = no drag)
    GROUNDING_VELOCITY: 1.0,       // Max velocity (pixels/frame) to treat collision as soft landing and ground ship.
    // Above this threshold, collision uses bounce/damping logic instead.
    // Range: 0.5-2.0 typical. Higher = more aggressive grounding.
    GROUNDING_NUDGE: 0.5,          // Small downward nudge (pixels) applied when grounded but no collision detected.
    // Keeps ship in contact with surface. Should be << player size and <= GROUNDING_VELOCITY.
    COLLISION_DAMPING: 0.4,        // Velocity damping factor (0-1) for low-speed collisions. 0 = full stop, 1 = no damping.
    BOUNCE_AMOUNT: 0.5             // Bounce damping factor (0-1) for high-speed collisions. Lower = less bouncy.
  };

  static PLAYER = {
    SIZE: 15,                // Player ship triangle size (in world space)
    RESPAWN_TIME: 3000,      // Milliseconds before respawn after death
    INVULNERABLE_TIME: 2000, // Invulnerability after spawn (ms)
    FLAME_BASE_LENGTH: 15,   // Base thrust flame length
    FLAME_VARIATION: 12       // Random variation in flame length
  };

  static EXPLOSION = {
    DURATION: 800,           // Explosion animation duration in ms
    MAX_RADIUS: 40,          // Maximum radius of explosion circle
    FADE_START: 0.4          // Start fading at 40% of animation
  };

  static BULLET = {
    SPEED: 12,               // Bullet velocity
    LIFETIME: 120,           // Frames before bullet expires
    SIZE: 4,                 // Bullet radius
    COOLDOWN: 15,            // Frames between shots
    BOX_PUSH_FORCE: 6        // Force applied to boxes on impact
  };

  static COLLISION = {
    RADIUS: 15 + 4,              // Player size + bullet size for collision detection
    EPSILON: 0.0001,             // Small value for floating-point comparisons in geometry
    VELOCITY_EPSILON: 0.001,     // Minimum velocity magnitude to avoid division by zero
    PUSH_OUT_DISTANCE: 2,        // Distance to push ship away from box when resolving collision
    PUSH_OUT_DIAGONAL: Math.SQRT2 // Diagonal push distance (sqrt(2) ≈ 1.414)
  };

  static TIMING = {
    FRAME_TIME_MS: 1000 / 60  // Milliseconds per frame at 60fps
  };

  static KEY_CODES = {
    LEFT: 37,
    RIGHT: 39,
    UP: 38,
    DOWN: 40,
    SPACE: 32
  };

  // Key mapping for state synchronization
  static KEY_MAP = [
    { name: 'left', code: 37 },
    { name: 'right', code: 39 },
    { name: 'up', code: 38 },
    { name: 'down', code: 40 }
  ];

  static COLORS = {
    BACKGROUND: { r: 10, g: 10, b: 30 },       // Dark space background
    PLAYER_LOCAL: { r: 100, g: 200, b: 255 },  // Cyan for local player
    PLAYER_REMOTE: { r: 255, g: 100, b: 100 }, // Red for remote players (fallback)
    BULLET_LOCAL: { r: 0, g: 0, b: 0 },        // Black bullets for own player
    BULLET_REMOTE: { r: 255, g: 0, b: 0 },     // Red bullets for enemies
    THRUST_FLAME: { r: 255, g: 150, b: 50 },   // Orange thrust flame
    UI_TEXT: 255                                // White text
  };

  static DEFAULT_PLAYER_NAME = 'Player';      // Default name for players without a name
  static DEFAULT_PLAYER_COLOR = '#ff6464';    // Default color for players without a color (red)


  static SPAWN = {
    MAX_ATTEMPTS: 20,        // Maximum attempts to find valid spawn location
    SEARCH_RADIUS: 150,      // Radius around box center to search for spawn point
    MIN_DISTANCE_FROM_BOX: 30 // Minimum distance from any box to spawn
  };



  // ============================================================================
  // SINGLETON MANAGEMENT & SOFT DEPENDENCY INTERFACE
  // ============================================================================

  static instance = null;
  static hasRemotePlayers = false;
  static _activeManager = null; // Track which manager we are currently listening to

  /**
   * Main game loop - handles updates, drawing, and lifecycle.
   * This is the ONLY method that needs to be called from the main sketch draw loop.
   * Safe to call even if game is not active (zero overhead).
   * @param {CollaborationManager} collaborationManager 
   * @param {MindMap} mindMap 
   */
  static loop(collaborationManager, mindMap) {
    // 1. Sync remote activity listener (Event-driven, not Polling)
    // If the manager changes (or matches current but we haven't set up yet), set up listeners
    if (collaborationManager !== ThrustGame._activeManager) {
      ThrustGame._setupAwarenessListener(collaborationManager);
      ThrustGame._activeManager = collaborationManager;

      // If we switched managers, we should probably reset the instance to clear old state
      if (ThrustGame.instance) {
        ThrustGame.instance.stop(); // Clean up old state
        ThrustGame.instance = null;
      }
    }

    // 2. If neither active locally nor remotely meaningful, do nothing (Zero Overhead)
    if ((!ThrustGame.instance || !ThrustGame.instance.active) && !ThrustGame.hasRemotePlayers) {
      return;
    }

    // 3. Ensure instance exists if we need to render something
    if (!ThrustGame.instance) {
      ThrustGame.instance = new ThrustGame(collaborationManager, mindMap);
    }

    // Ensure dependencies are up to date
    ThrustGame.instance.collaborationManager = collaborationManager;
    ThrustGame.instance.mindMap = mindMap;

    // 4. Update Game Logic (only if locally active)
    if (ThrustGame.instance.active) {
      ThrustGame.instance.update();
    }

    // 5. Draw Game (includes remote players if they exist)
    ThrustGame.instance.draw();

    // 6. Draw UI Overlay
    if (ThrustGame.instance.active || ThrustGame.hasRemotePlayers) {
      // Vital: Update remote player states from awareness every frame while running
      // This ensures smooth 60fps interpolation even if the "presence check" is throttled
      ThrustGame.instance.updateRemotePlayers();

      ThrustGame.instance.drawUI();
    }
  }

  /**
   * Sets up awareness listener to update hasRemotePlayers flag efficiently.
   * This restores the O(1) per frame performance by avoiding polling.
   */
  static _setupAwarenessListener(manager) {
    // Clean up old listener if one exists on the previous manager
    if (ThrustGame._cleanupListener) {
      ThrustGame._cleanupListener();
      ThrustGame._cleanupListener = null;
    }

    if (!manager || !manager.awareness) {
      ThrustGame.hasRemotePlayers = false;
      return;
    }

    // Check for remote players in thrust mode
    // Note: Not throttled to ensure immediate visibility of remote players
    const checkActivity = () => {
      const states = manager.awareness.getStates();
      const myClientId = manager.awareness.clientID;
      let foundRemote = false;
      for (const [clientId, state] of states) {
        if (clientId !== myClientId && state.thrustGame) {
          foundRemote = true;
          break;
        }
      }
      ThrustGame.hasRemotePlayers = foundRemote;
    };

    // Listen for changes
    manager.awareness.on('change', checkActivity);

    // Initial check
    checkActivity();

    // Store cleanup function
    ThrustGame._cleanupListener = () => {
      if (manager && manager.awareness) {
        manager.awareness.off('change', checkActivity);
      }
    };
  }

  /**
   * Checks for remote players via CollaborationManager awareness.
   * DEPRECATED: Use _setupAwarenessListener internally instead.
   */
  static checkRemoteActivity(collaborationManager) {
    // Left for compatibility if needed, but loop() now handles this better
    if (collaborationManager !== ThrustGame._activeManager) {
      ThrustGame._setupAwarenessListener(collaborationManager);
      ThrustGame._activeManager = collaborationManager;
    }
  }



  /**
   * Static input handler
   * @returns {boolean} True if input was consumed
   */
  static handleInput(key, keyCode) {
    // Toggle with Shift+T
    if (key === 'T') {
      ThrustGame.toggleInternal();
      return true; // Consume the event
    }

    if (ThrustGame.instance && ThrustGame.instance.active) {
      ThrustGame.instance.handleKeyPressed(key, keyCode);
      return true; // Consume event
    }
    return false;
  }

  /**
   * Static key release handler
   */
  static handleKeyReleased(keyCode) {
    if (ThrustGame.instance && ThrustGame.instance.active) {
      ThrustGame.instance.handleKeyReleased(keyCode);
      return true;
    }
    return false;
  }

  /**
   * Internal toggle helper
   */
  static toggleInternal() {
    if (!ThrustGame.instance) {
      // Create with nulls, they will be injected in loop() or constructor
      // We rely on loop() passing the current managers
      ThrustGame.instance = new ThrustGame(null, null);
    }

    // If we're starting, we need to ensure active is set
    if (!ThrustGame.instance.active) {
      ThrustGame.instance.start();
    } else {
      ThrustGame.instance.stop();
    }
  }

  /**
   * Creates a new ThrustGame instance
   * @param {CollaborationManager} collaborationManager - Optional collaboration manager for multiplayer
   * @param {MindMap} mindMap - Reference to mind map for box collision detection
   */
  constructor(collaborationManager = null, mindMap = null) {
    this.collaborationManager = collaborationManager;
    this.mindMap = mindMap;
    this.active = false;

    // Local player state
    this.player = this.createPlayer();

    // Game objects
    this.bullets = [];  // Local bullets
    this.remotePlayers = new Map();  // Remote players by clientId
    this.remoteBullets = new Map();  // Remote bullets by bulletId
    this.explosions = [];  // Active explosion animations

    // Input state - track current frame state
    this.keys = {
      left: false,
      right: false,
      up: false,
      down: false,
      space: false
    };

    // Timing
    this.lastFireTime = 0;

    // Score tracking
    this.score = 0;
    this.deaths = 0;

    // Multiplayer state
    this.multiplayerInitialized = false;

    // Idle detection for bandwidth optimization
    this.lastMovementTime = Date.now();
    this.isIdle = false;
    this.lastBroadcastState = null; // Track last broadcast to detect changes

    // Setup multiplayer if available
    if (this.collaborationManager && this.collaborationManager.isConnected) {
      this.setupMultiplayer();
    }
  }

  // ============================================================================
  // STATIC METHODS
  // ============================================================================



  // ============================================================================
  // COLLISION DETECTION HELPERS
  // ============================================================================

  /**
   * Gets the three vertices of the ship triangle in world space
   * @param {Object} player - Player object with x, y, angle
   * @returns {Array<{x: number, y: number}>} Array of 3 vertices
   */
  static getShipTriangleVertices(player) {
    const size = ThrustGame.PLAYER.SIZE;
    const halfSize = size / 2;

    // Local coordinates of the triangle (before rotation)
    const localVertices = [
      { x: size, y: 0 },           // Front tip
      { x: -halfSize, y: -halfSize }, // Back left
      { x: -halfSize, y: halfSize }   // Back right
    ];

    // Apply rotation and translation to get world coordinates
    const cos = Math.cos(player.angle);
    const sin = Math.sin(player.angle);

    return localVertices.map(v => ({
      x: player.x + v.x * cos - v.y * sin,
      y: player.y + v.x * sin + v.y * cos
    }));
  }

  /**
   * Checks if a triangle collides with an axis-aligned rectangle (box)
   * Uses Separating Axis Theorem (SAT)
   * @param {Array<{x: number, y: number}>} triangleVertices - Triangle vertices
   * @param {Object} box - Box with x, y (center), width, height
   * @returns {boolean} True if collision detected
   */
  static triangleBoxCollision(triangleVertices, box) {
    // Get box corners
    const halfW = box.width / 2;
    const halfH = box.height / 2;
    const boxLeft = box.x - halfW;
    const boxRight = box.x + halfW;
    const boxTop = box.y - halfH;
    const boxBottom = box.y + halfH;

    // Quick check: if any triangle vertex is inside the box, there's a collision
    for (const v of triangleVertices) {
      if (v.x >= boxLeft && v.x <= boxRight && v.y >= boxTop && v.y <= boxBottom) {
        return true;
      }
    }

    // Check if any box corner is inside the triangle
    const boxCorners = [
      { x: boxLeft, y: boxTop },
      { x: boxRight, y: boxTop },
      { x: boxLeft, y: boxBottom },
      { x: boxRight, y: boxBottom }
    ];

    for (const corner of boxCorners) {
      if (ThrustGame.pointInTriangle(corner, triangleVertices)) {
        return true;
      }
    }

    // Check if any triangle edge intersects any box edge
    for (let i = 0; i < 3; i++) {
      const v1 = triangleVertices[i];
      const v2 = triangleVertices[(i + 1) % 3];

      // Check intersection with all 4 box edges
      if (ThrustGame.lineSegmentIntersectsBox(v1, v2, boxLeft, boxRight, boxTop, boxBottom)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks if a point is inside a triangle using barycentric coordinates
   * @param {Object} point - Point with x, y
   * @param {Array<{x: number, y: number}>} triangle - Triangle vertices [v0, v1, v2]
   * @returns {boolean} True if point is inside triangle
   */
  static pointInTriangle(point, triangle) {
    const v0 = triangle[0];
    const v1 = triangle[1];
    const v2 = triangle[2];

    // Compute barycentric coordinates
    const d00 = (v1.x - v0.x) * (v1.x - v0.x) + (v1.y - v0.y) * (v1.y - v0.y);
    const d01 = (v1.x - v0.x) * (v2.x - v0.x) + (v1.y - v0.y) * (v2.y - v0.y);
    const d11 = (v2.x - v0.x) * (v2.x - v0.x) + (v2.y - v0.y) * (v2.y - v0.y);
    const d20 = (point.x - v0.x) * (v1.x - v0.x) + (point.y - v0.y) * (v1.y - v0.y);
    const d21 = (point.x - v0.x) * (v2.x - v0.x) + (point.y - v0.y) * (v2.y - v0.y);

    const denom = d00 * d11 - d01 * d01;
    if (Math.abs(denom) < ThrustGame.COLLISION.EPSILON) return false; // Degenerate triangle

    const v = (d11 * d20 - d01 * d21) / denom;
    const w = (d00 * d21 - d01 * d20) / denom;
    const u = 1 - v - w;

    // Check if point is in triangle
    return (u >= 0) && (v >= 0) && (w >= 0);
  }

  /**
   * Checks if a line segment intersects with a box
   * @param {Object} p1 - First point of line segment
   * @param {Object} p2 - Second point of line segment
   * @param {number} boxLeft - Left edge of box
   * @param {number} boxRight - Right edge of box
   * @param {number} boxTop - Top edge of box
   * @param {number} boxBottom - Bottom edge of box
   * @returns {boolean} True if line segment intersects box
   */
  static lineSegmentIntersectsBox(p1, p2, boxLeft, boxRight, boxTop, boxBottom) {
    // Check intersection with each of the 4 box edges
    return (
      ThrustGame.lineSegmentsIntersect(p1, p2, { x: boxLeft, y: boxTop }, { x: boxRight, y: boxTop }) ||
      ThrustGame.lineSegmentsIntersect(p1, p2, { x: boxRight, y: boxTop }, { x: boxRight, y: boxBottom }) ||
      ThrustGame.lineSegmentsIntersect(p1, p2, { x: boxRight, y: boxBottom }, { x: boxLeft, y: boxBottom }) ||
      ThrustGame.lineSegmentsIntersect(p1, p2, { x: boxLeft, y: boxBottom }, { x: boxLeft, y: boxTop })
    );
  }

  /**
   * Checks if two line segments intersect
   * @param {Object} p1 - First point of segment 1
   * @param {Object} p2 - Second point of segment 1
   * @param {Object} p3 - First point of segment 2
   * @param {Object} p4 - Second point of segment 2
   * @returns {boolean} True if segments intersect
   */
  static lineSegmentsIntersect(p1, p2, p3, p4) {
    const ccw = (a, b, c) => (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
    return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
  }

  /**
   * Checks if a position is inside or too close to any box
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {Array} boxes - Array of box objects
   * @param {number} minDistance - Minimum distance from box edges
   * @returns {boolean} True if position is valid (not inside or too close to boxes)
   */
  static isValidSpawnPosition(x, y, boxes, minDistance) {
    if (!boxes || boxes.length === 0) return true;

    for (const box of boxes) {
      if (!box) continue;

      const halfW = box.width / 2;
      const halfH = box.height / 2;

      // Expand box by minDistance
      const boxLeft = box.x - halfW - minDistance;
      const boxRight = box.x + halfW + minDistance;
      const boxTop = box.y - halfH - minDistance;
      const boxBottom = box.y + halfH + minDistance;

      // Check if point is inside expanded box
      if (x >= boxLeft && x <= boxRight && y >= boxTop && y <= boxBottom) {
        return false;
      }
    }

    return true;
  }

  // ============================================================================
  // PLAYER MANAGEMENT
  // ============================================================================

  /**
   * Creates a new player at spawn position
   * @returns {Object} Player object with position, velocity, and state
   */
  createPlayer() {
    // Default spawn position if no boxes
    let spawnX = 300;
    let spawnY = 200;

    if (this.mindMap && this.mindMap.boxes && this.mindMap.boxes.length > 0) {
      // Find the center of all boxes
      let sumX = 0, sumY = 0, count = 0;
      for (const box of this.mindMap.boxes) {
        if (box && box.x != null && box.y != null) {
          sumX += box.x;
          sumY += box.y;
          count++;
        }
      }

      if (count > 0) {
        const centerX = sumX / count;
        const centerY = sumY / count;

        // Try to find a valid spawn position that's not inside a box
        let foundValidPosition = false;
        const maxAttempts = ThrustGame.SPAWN.MAX_ATTEMPTS;
        const searchRadius = ThrustGame.SPAWN.SEARCH_RADIUS;
        const minDistance = ThrustGame.SPAWN.MIN_DISTANCE_FROM_BOX;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          // Generate random position around the center of boxes
          const angle = Math.random() * Math.PI * 2;
          const distance = Math.random() * searchRadius;
          const testX = centerX + Math.cos(angle) * distance;
          const testY = centerY + Math.sin(angle) * distance;

          // Check if this position is valid (not inside or too close to any box)
          if (ThrustGame.isValidSpawnPosition(testX, testY, this.mindMap.boxes, minDistance)) {
            spawnX = testX;
            spawnY = testY;
            foundValidPosition = true;
            break;
          }
        }

        // If no valid position found after all attempts, try validated fallback positions
        if (!foundValidPosition) {
          const offset = searchRadius * 1.5;
          const fallbackCandidates = [
            { x: centerX - offset, y: centerY - offset },
            { x: centerX + offset, y: centerY - offset },
            { x: centerX - offset, y: centerY + offset },
            { x: centerX + offset, y: centerY + offset }
          ];

          for (const candidate of fallbackCandidates) {
            if (ThrustGame.isValidSpawnPosition(candidate.x, candidate.y, this.mindMap.boxes, minDistance)) {
              spawnX = candidate.x;
              spawnY = candidate.y;
              foundValidPosition = true;
              break;
            }
          }
          // If no fallback candidate is valid, keep the original spawnX/spawnY defaults
        }
      }
    }

    return {
      x: spawnX,
      y: spawnY,
      vx: 0,
      vy: 0,
      angle: 0,  // 0 points right, increases clockwise
      alive: true,
      respawnTime: 0,
      invulnerableUntil: Date.now() + ThrustGame.PLAYER.INVULNERABLE_TIME,
      grounded: false  // Track if ship is resting on a surface
    };
  }

  /**
   * Respawns the player after death
   */
  respawnPlayer() {
    // Use the same spawn logic
    const newPlayer = this.createPlayer();
    this.player.x = newPlayer.x;
    this.player.y = newPlayer.y;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.angle = 0;
    this.player.alive = true;
    this.player.respawnTime = 0;
    this.player.invulnerableUntil = Date.now() + ThrustGame.PLAYER.INVULNERABLE_TIME;
  }

  // ============================================================================
  // GAME LIFECYCLE
  // ============================================================================

  /**
   * Starts the game
   */
  start() {
    this.active = true;
    this.player = this.createPlayer();
    this.bullets = [];
    this.score = 0;
    this.deaths = 0;

    // Clear all key states to prevent stuck keys
    this.keys = {
      left: false,
      right: false,
      up: false,
      down: false,
      space: false
    };

    // Reset idle detection state
    this.lastMovementTime = Date.now();
    this.isIdle = false;
    this.lastBroadcastState = null;

    // Setup multiplayer if connected (may not have been connected at construction time)
    if (this.collaborationManager && this.collaborationManager.isConnected) {
      this.setupMultiplayer();
      this.broadcastPlayerState();
    }
  }

  /**
   * Stops the game and cleans up state
   */
  stop() {
    // Set inactive first
    this.active = false;

    // Clear multiplayer state from awareness
    if (this.collaborationManager && this.collaborationManager.awareness) {
      this.collaborationManager.awareness.setLocalStateField('thrustGame', null);
    }

    // Clear all game state
    this.bullets = [];
    this.remotePlayers.clear();
    this.remoteBullets.clear();

    // Force clear all keyboard states to prevent stuck keys
    this.keys = {
      left: false,
      right: false,
      up: false,
      down: false,
      space: false
    };

    // Clear explosion animations
    this.explosions = [];

    // Reset idle detection state to prevent stale data on restart
    this.lastBroadcastState = null;
    this.lastMovementTime = Date.now();
    this.isIdle = false;
  }

  /**
   * Updates game state (physics, collisions, etc.)
   */
  update() {
    if (!this.active) return;

    // Sync keyboard state to catch any missed events
    this.syncKeyboardState();

    // Handle respawn timing
    if (!this.player.alive) {
      if (Date.now() >= this.player.respawnTime) {
        this.respawnPlayer();
      }
      return;
    }

    // Update player physics
    this.updatePlayerPhysics();

    // Center camera on player's spaceship to keep it in the center of the screen
    if (typeof CameraUtils !== 'undefined' && typeof width !== 'undefined' && typeof height !== 'undefined') {
      CameraUtils.centerOn(this.player.x, this.player.y, width, height);
    }

    // Update bullets
    this.updateBullets();

    // Update explosion animations
    this.updateExplosions();

    // Check collisions
    this.checkCollisions();

    // Interpolate remote players for smooth movement (only when active)
    this.interpolateRemotePlayers();

    // Broadcast state to multiplayer
    if (this.collaborationManager && this.collaborationManager.isConnected) {
      // Throttle broadcasts (every ~100ms for balanced gameplay and bandwidth)
      // 100ms = 10 updates per second, sufficient for multiplayer game
      const now = Date.now();
      if (!this.lastBroadcast || now - this.lastBroadcast > 100) {
        this.broadcastPlayerState();
        this.lastBroadcast = now;
      }
    }
  }

  /**
   * Updates player physics based on input and forces
   */
  updatePlayerPhysics() {
    const p = this.player;
    const phys = ThrustGame.PHYSICS;

    // Store previous state for collision resolution (position and angle)
    // These are used to revert if collision cannot be resolved with push-out
    const prevX = p.x;
    const prevY = p.y;
    const prevAngle = p.angle;

    // Apply rotation
    if (this.keys.left) {
      p.angle -= phys.ROTATION_SPEED;
      p.grounded = false;  // Rotation breaks grounded state
    }
    if (this.keys.right) {
      p.angle += phys.ROTATION_SPEED;
      p.grounded = false;  // Rotation breaks grounded state
    }

    // Apply thrust in the direction the ship is facing
    if (this.keys.up) {
      p.vx += Math.cos(p.angle) * phys.THRUST;
      p.vy += Math.sin(p.angle) * phys.THRUST;
      p.grounded = false;  // Thrust breaks grounded state
    }

    // Optional downward thrust (reverse)
    if (this.keys.down) {
      p.vx -= Math.cos(p.angle) * phys.THRUST * 0.5;
      p.vy -= Math.sin(p.angle) * phys.THRUST * 0.5;
      p.grounded = false;  // Thrust breaks grounded state
    }

    // Only apply gravity if not grounded
    if (!p.grounded) {
      p.vy += phys.GRAVITY;
    }

    // Apply drag
    p.vx *= phys.DRAG;
    p.vy *= phys.DRAG;

    // Limit speed
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    if (speed > phys.MAX_SPEED) {
      const scale = phys.MAX_SPEED / speed;
      p.vx *= scale;
      p.vy *= scale;
    }

    // Update position
    p.x += p.vx;
    p.y += p.vy;

    // Check collision with boxes using triangular ship shape
    if (this.mindMap && this.mindMap.boxes) {
      const shipVertices = ThrustGame.getShipTriangleVertices(p);
      let collisionDetected = false;

      // Check collisions with boxes (if mindMap exists)
      if (this.mindMap && this.mindMap.boxes) {
        let collisionDetected = false;
        const shipVertices = ThrustGame.getShipTriangleVertices(p);

        for (const box of this.mindMap.boxes) {
          if (!box) continue;

          // Check if ship triangle collides with box
          if (ThrustGame.triangleBoxCollision(shipVertices, box)) {
            collisionDetected = true;

            // Collision detected - handle based on velocity
            const velocityMagnitude = Math.sqrt(p.vx * p.vx + p.vy * p.vy);

            // Try to push ship out to resolve collision
            const separation = this.resolveTriangleBoxCollision(p, box, prevX, prevY, prevAngle);

            if (separation) {
              const isBeingPushedUp = separation.y < 0;  // Negative y = upward in p5.js

              // Check if ship should be grounded (resting on top of box)
              // Note: Using >= 0 to allow re-grounding when nudged (vy=0 after zeroing)
              if (velocityMagnitude < phys.GROUNDING_VELOCITY && isBeingPushedUp && p.vy >= 0) {
                // Low velocity collision from above - ground the ship
                // Don't push out, just stop at current position
                p.vx = 0;
                p.vy = 0;
                p.grounded = true;
                // Don't apply separation - keep ship at current position
              } else {
                // Apply separation for high-velocity or non-resting collisions
                p.x += separation.x;
                p.y += separation.y;

                if (velocityMagnitude > 0.5) {
                  // Significant velocity - bounce
                  p.vx *= -phys.BOUNCE_AMOUNT;
                  p.vy *= -phys.BOUNCE_AMOUNT;
                } else {
                  // Low velocity - dampen
                  p.vx *= phys.COLLISION_DAMPING;
                  p.vy *= phys.COLLISION_DAMPING;
                }
                p.grounded = false;
              }
            } else {
              // Fallback: revert to previous position
              p.x = prevX;
              p.y = prevY;
              p.vx *= -phys.BOUNCE_AMOUNT;
              p.vy *= -phys.BOUNCE_AMOUNT;
              p.grounded = false;
            }

            break; // Only handle one collision per frame
          }
        }

        // If no collision this frame but was grounded, apply small downward movement
        // This keeps ship in contact with surface, but only if there's a surface below
        if (!collisionDetected && p.grounded) {
          const nudge = phys.GROUNDING_NUDGE;
          // Predictively check if moving down by the nudge would collide with any box
          const nudgedPlayer = { x: p.x, y: p.y + nudge, angle: p.angle };
          const nudgedVertices = ThrustGame.getShipTriangleVertices(nudgedPlayer);
          let hasSurfaceBelow = false;
          for (const box of this.mindMap.boxes) {
            if (!box) continue;
            if (ThrustGame.triangleBoxCollision(nudgedVertices, box)) {
              hasSurfaceBelow = true;
              break;
            }
          }
          if (hasSurfaceBelow) {
            p.y += nudge;  // Small downward nudge to re-establish collision
          } else {
            // No surface below - unground the ship
            p.grounded = false;
          }
        }
      }

      // No screen wrapping - player stays in world space
    }
  }

  /**
     * Attempts to resolve triangle-box collision by trying push-out vectors.
     * Tests 8 directional displacement vectors to find one that resolves the collision.
     * @param {Object} player - Player object with x, y, angle
     * @param {Object} box - Box object with collision geometry
     * @param {number} prevX - Previous x position (unused, kept for signature compatibility)
     * @param {number} prevY - Previous y position (unused, kept for signature compatibility)  
     * @param {number} prevAngle - Previous angle (unused, kept for signature compatibility)
     * @returns {Object|null} Separation vector {x, y} or null if no resolution found
     */
  resolveTriangleBoxCollision(player, box, prevX, prevY, prevAngle) {
    // Try small displacement vectors to push ship out of box
    // Using constants for consistent push distances
    const d = ThrustGame.COLLISION.PUSH_OUT_DISTANCE;      // Cardinal directions
    const diag = ThrustGame.COLLISION.PUSH_OUT_DIAGONAL;   // Diagonals

    const pushOutVectors = [
      { x: 0, y: -d },        // Push up
      { x: 0, y: d },         // Push down
      { x: -d, y: 0 },        // Push left
      { x: d, y: 0 },         // Push right
      { x: -diag, y: -diag }, // Diagonal up-left
      { x: diag, y: -diag },  // Diagonal up-right
      { x: -diag, y: diag },  // Diagonal down-left
      { x: diag, y: diag }    // Diagonal down-right
    ];

    // Test each separation vector
    for (const sep of pushOutVectors) {
      const testPlayer = {
        x: player.x + sep.x,
        y: player.y + sep.y,
        angle: player.angle
      };

      const testVertices = ThrustGame.getShipTriangleVertices(testPlayer);

      if (!ThrustGame.triangleBoxCollision(testVertices, box)) {
        return sep; // Found a valid separation
      }
    }

    return null; // Could not resolve with small displacement
  }

  /**
   * Updates all bullets (movement and lifetime)
   */
  updateBullets() {
    // Update local bullets in place and remove expired ones
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];

      bullet.x += bullet.vx;
      bullet.y += bullet.vy;
      bullet.lifetime--;

      // Check collision with boxes and apply force if hit
      const hitBox = this.checkBulletBoxCollision(bullet);
      if (hitBox) {
        // Apply push force to the box
        this.applyBulletForceToBox(hitBox, bullet);
        // Remove bullet on collision with box
        this.bullets.splice(i, 1);
        continue;
      }

      // Remove expired bullets
      if (bullet.lifetime <= 0) {
        this.bullets.splice(i, 1);
      }
    }

    // Update remote bullets - check for box collisions
    // Note: Each client independently checks remote bullets against their local boxes.
    // This is intentional to prevent bullets from appearing to pass through boxes on
    // different clients. Remote bullets are continuously re-synced from their owners,
    // so temporary desync is acceptable and self-correcting.
    for (const [bulletId, bullet] of this.remoteBullets) {
      const hitBox = this.checkBulletBoxCollision(bullet);
      if (hitBox) {
        // Apply push force to the box
        this.applyBulletForceToBox(hitBox, bullet);
        this.remoteBullets.delete(bulletId);
      }
    }
  }

  /**
   * Creates an explosion at the specified location
   * @param {number} x - World X coordinate
   * @param {number} y - World Y coordinate
   */
  createExplosion(x, y) {
    this.explosions.push({
      x: x,
      y: y,
      startTime: Date.now(),
      duration: ThrustGame.EXPLOSION.DURATION
    });
  }

  /**
   * Updates explosion animations and removes expired ones
   */
  updateExplosions() {
    const now = Date.now();

    // Remove expired explosions
    this.explosions = this.explosions.filter(explosion => {
      const elapsed = now - explosion.startTime;
      return elapsed < explosion.duration;
    });
  }

  /**
   * Checks if a bullet collides with any box
   * @param {Object} bullet - Bullet to check
   * @returns {Object|null} The box that was hit, or null if no collision
   */
  checkBulletBoxCollision(bullet) {
    if (!this.mindMap || !this.mindMap.boxes) return null;

    const bulletRadius = ThrustGame.BULLET.SIZE; // SIZE is defined as radius (4 pixels)

    for (const box of this.mindMap.boxes) {
      if (!box) continue;

      // Get box bounds
      const boxLeft = box.x - box.width / 2;
      const boxRight = box.x + box.width / 2;
      const boxTop = box.y - box.height / 2;
      const boxBottom = box.y + box.height / 2;

      // Check if bullet circle collides with box rectangle
      // Find closest point on rectangle to bullet center
      const closestX = Math.max(boxLeft, Math.min(bullet.x, boxRight));
      const closestY = Math.max(boxTop, Math.min(bullet.y, boxBottom));

      // Calculate squared distance (avoids sqrt for performance)
      const distX = bullet.x - closestX;
      const distY = bullet.y - closestY;
      const distSq = distX * distX + distY * distY;

      // Compare squared distance to squared radius
      if (distSq < bulletRadius * bulletRadius) {
        return box; // Return the box that was hit
      }
    }

    return null;
  }

  /**
   * Applies a small force to a box when hit by a bullet.
   * Updates both position and interpolation targets to prevent snap-back.
   * Syncs changes to collaboration if connected.
   * @param {Object} box - The box to apply force to
   * @param {Object} bullet - The bullet providing the force
   */
  applyBulletForceToBox(box, bullet) {
    if (!box) return;

    // Calculate normalized impact direction from bullet velocity
    const speed = Math.sqrt(bullet.vx * bullet.vx + bullet.vy * bullet.vy);
    if (speed < ThrustGame.COLLISION.VELOCITY_EPSILON) return; // Avoid division by zero

    const dirX = bullet.vx / speed;
    const dirY = bullet.vy / speed;

    // Apply small force in the direction of bullet travel
    const force = ThrustGame.BULLET.BOX_PUSH_FORCE;
    box.x += dirX * force;
    box.y += dirY * force;

    // IMPORTANT: Also update targetX/targetY to prevent interpolation snap-back
    // TextBox interpolates towards these targets, so they must match the new position
    if (typeof box.targetX !== 'undefined' && typeof box.targetY !== 'undefined') {
      box.targetX = box.x;
      box.targetY = box.y;
    }

    // Sync the pushed box position to collaboration if available
    // Use false for skipTransactionWrapper to ensure proper transaction
    if (this.collaborationManager && this.collaborationManager.isConnected) {
      this.collaborationManager.syncBoxToYjs(box, false);
    }
  }

  /**
   * Checks for collisions between bullets and players
   */
  checkCollisions() {
    // Check local bullets against remote players
    // Process backwards so we can safely splice
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      let bulletHit = false;

      for (const [clientId, remotePlayer] of this.remotePlayers) {
        if (!remotePlayer.alive) continue;

        const dx = bullet.x - remotePlayer.x;
        const dy = bullet.y - remotePlayer.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < ThrustGame.COLLISION.RADIUS) {
          // Hit! Remove bullet immediately and increment score
          this.bullets.splice(i, 1);
          this.score++;
          bulletHit = true;
          
          // Create explosion at remote player's position for immediate visual feedback
          // The remote player will also create their own explosion and update their state
          this.createExplosion(remotePlayer.x, remotePlayer.y);
          
          break; // Stop checking this bullet against other players
        }
      }
    }

    // Check remote bullets against local player
    if (this.player.alive && Date.now() > this.player.invulnerableUntil) {
      for (const [bulletId, bullet] of this.remoteBullets) {
        const dx = bullet.x - this.player.x;
        const dy = bullet.y - this.player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < ThrustGame.COLLISION.RADIUS) {
          // Hit! Player dies and respawns
          this.player.alive = false;
          this.player.respawnTime = Date.now() + ThrustGame.PLAYER.RESPAWN_TIME;
          this.deaths++;

          // Create explosion at death location
          this.createExplosion(this.player.x, this.player.y);

          // Remove the bullet that hit us
          this.remoteBullets.delete(bulletId);
          break;
        }
      }
    }
  }

  /**
   * Interpolates remote players' positions for smooth movement
   * Only runs when thrust mode is active to avoid CPU overhead
   */
  interpolateRemotePlayers() {
    // Interpolate whenever called (managed by Loop for zero-overhead when dormant)

    // Interpolation speed factor (0 = no movement, 1 = instant snap)
    // Lower values = smoother but more lag, higher = more responsive but jerkier
    // 0.3 provides a good balance for 60 FPS gameplay with 10 Hz network updates
    const interpolationFactor = 0.3;

    for (const [clientId, player] of this.remotePlayers) {
      // Only interpolate alive players
      if (!player.alive) continue;

      // Ensure target positions exist (they should from updateRemotePlayers)
      if (player.targetX === undefined || player.targetY === undefined || player.targetAngle === undefined) {
        continue;
      }

      // Linear interpolation for position (lerp)
      player.x = player.x + (player.targetX - player.x) * interpolationFactor;
      player.y = player.y + (player.targetY - player.y) * interpolationFactor;

      // Angular interpolation (handle wrapping around 2π)
      let angleDiff = player.targetAngle - player.angle;

      // Normalize angle difference to [-π, π] for shortest rotation
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      player.angle = player.angle + angleDiff * interpolationFactor;

      // Normalize angle to [0, 2π]
      while (player.angle < 0) player.angle += Math.PI * 2;
      while (player.angle >= Math.PI * 2) player.angle -= Math.PI * 2;
    }
  }

  // ============================================================================
  // INPUT HANDLING
  // ============================================================================

  /**
   * Handles key press events
   * @param {string} key - The key that was pressed
   * @param {number} keyCode - The key code
   */
  handleKeyPressed(key, keyCode) {
    if (!this.active) return;

    const K = ThrustGame.KEY_CODES;

    // Arrow keys
    if (keyCode === K.LEFT) {
      this.keys.left = true;
    } else if (keyCode === K.RIGHT) {
      this.keys.right = true;
    } else if (keyCode === K.UP) {
      this.keys.up = true;
    } else if (keyCode === K.DOWN) {
      this.keys.down = true;
    }

    // Spacebar for shooting
    if (keyCode === K.SPACE || key === ' ') {
      this.fireBullet();
    }
  }

  /**
   * Handles key release events
   * @param {number} keyCode - The key code
   */
  handleKeyReleased(keyCode) {
    // Always handle key releases to prevent stuck keys, even when inactive
    const K = ThrustGame.KEY_CODES;

    if (keyCode === K.LEFT) {
      this.keys.left = false;
    } else if (keyCode === K.RIGHT) {
      this.keys.right = false;
    } else if (keyCode === K.UP) {
      this.keys.up = false;
    } else if (keyCode === K.DOWN) {
      this.keys.down = false;
    }
  }

  /**
   * Syncs keyboard state with p5.js keyIsDown() to catch any missed events
   * This provides a fallback mechanism for stuck keys
   */
  syncKeyboardState() {
    if (!this.active) return;
    if (typeof keyIsDown !== 'function') return;

    // Check each key and clear if stuck (uses pre-allocated KEY_MAP)
    for (const { name, code } of ThrustGame.KEY_MAP) {
      if (this.keys[name] && !keyIsDown(code)) {
        this.keys[name] = false;
      }
    }
  }

  /**
   * Fires a bullet from the player's ship
   */
  fireBullet() {
    if (!this.player.alive) return;

    const now = Date.now();
    const cooldownMs = ThrustGame.BULLET.COOLDOWN * ThrustGame.TIMING.FRAME_TIME_MS;
    if (now - this.lastFireTime < cooldownMs) return;

    this.lastFireTime = now;

    // Create bullet at ship tip
    const tipDist = ThrustGame.PLAYER.SIZE;

    // Generate UUID with fallback
    const bulletId = (typeof Utils !== 'undefined' && Utils.generateUUID)
      ? Utils.generateUUID()
      : `bullet_${Date.now()}_${Math.random()}`;

    const bullet = {
      id: bulletId,
      x: this.player.x + Math.cos(this.player.angle) * tipDist,
      y: this.player.y + Math.sin(this.player.angle) * tipDist,
      vx: Math.cos(this.player.angle) * ThrustGame.BULLET.SPEED + this.player.vx,
      vy: Math.sin(this.player.angle) * ThrustGame.BULLET.SPEED + this.player.vy,
      lifetime: ThrustGame.BULLET.LIFETIME
    };

    this.bullets.push(bullet);

    // Broadcast bullet to multiplayer
    if (this.collaborationManager && this.collaborationManager.isConnected) {
      this.broadcastBullet(bullet);
    }
  }

  // ============================================================================
  // RENDERING
  // ============================================================================

  /**
   * Draws the game in world space (called from main draw loop)
   * This is called WITHIN the world transform, so coordinates are in world space
   */
  draw() {
    // Early exit if no collaboration or no remote players
    if (!this.collaborationManager || !this.collaborationManager.isConnected) {
      // Only draw local game elements if active
      if (!this.active) return;
      // Continue to draw local player below
    } else {
      // Update remote players only if we have collaboration
      this.updateRemotePlayers();

      // Early exit if no remote players and not active locally
      if (this.remotePlayers.size === 0 && !this.active) {
        return;
      }
    }

    // Get viewport bounds for culling (optimization for 10+ players)
    const viewportWidth = typeof width !== 'undefined' ? width : 800;
    const viewportHeight = typeof height !== 'undefined' ? height : 600;
    let viewportBounds = null;

    if (typeof CameraUtils !== 'undefined') {
      // Calculate visible world bounds with a margin for smooth rendering
      const margin = 500; // Extra margin to avoid pop-in
      viewportBounds = {
        left: CameraUtils.worldX(0) - margin,
        right: CameraUtils.worldX(viewportWidth) + margin,
        top: CameraUtils.worldY(0) - margin,
        bottom: CameraUtils.worldY(viewportHeight) + margin
      };
    }

    // Helper function to check if a position is in viewport
    const isInViewport = (x, y) => {
      if (!viewportBounds) return true; // No culling if camera utils not available
      return x >= viewportBounds.left && x <= viewportBounds.right &&
        y >= viewportBounds.top && y <= viewportBounds.bottom;
    };

    // Draw remote players with their custom colors and names (with viewport culling)
    // This happens regardless of whether local player is in thrust mode
    for (const [clientId, remotePlayer] of this.remotePlayers) {
      if (remotePlayer.alive && isInViewport(remotePlayer.x, remotePlayer.y)) {
        // Draw remote players (any other player is considered an enemy)
        this.drawPlayer(remotePlayer, remotePlayer.color, remotePlayer.thrusting, false, remotePlayer.name);
      }
    }

    // Draw explosions for all players (before local player check)
    // This ensures explosions are visible even when not actively playing
    this.drawExplosions(viewportBounds, isInViewport);

    // Only draw local player, bullets, and UI if we're actually in thrust mode
    if (!this.active) return;

    // Draw local player (always draw, even if off-screen, for consistency)
    if (this.player.alive) {
      const isInvulnerable = Date.now() < this.player.invulnerableUntil;
      this.drawPlayer(this.player, ThrustGame.COLORS.PLAYER_LOCAL, this.keys.up, isInvulnerable);
    }

    // Draw bullets (with viewport culling)
    this.drawBullets(viewportBounds, isInViewport);
  }

  /**
   * Draws UI overlay in screen space
   * This should be called OUTSIDE the world transform
   */
  drawUI() {
    if (!this.active) return;

    push();
    resetMatrix();

    fill(ThrustGame.COLORS.UI_TEXT);
    textAlign(LEFT, TOP);
    textSize(14);

    // Score and stats with semi-transparent background
    fill(0, 0, 0, 150);
    noStroke();
    rect(5, 5, 120, 60, 5);

    fill(ThrustGame.COLORS.UI_TEXT);
    text(`Score: ${this.score}`, 10, 10);
    text(`Deaths: ${this.deaths}`, 10, 28);
    text('Shift+T: Exit', 10, 46);

    // Respawn countdown
    if (!this.player.alive) {
      textSize(24);
      textAlign(CENTER, CENTER);
      const canvasWidth = typeof width !== 'undefined' ? width : 800;
      const canvasHeight = typeof height !== 'undefined' ? height : 600;
      const timeLeft = Math.ceil((this.player.respawnTime - Date.now()) / 1000);
      if (timeLeft > 0) {
        fill(0, 0, 0, 180);
        rect(canvasWidth / 2 - 150, canvasHeight / 2 - 40, 300, 80, 10);
        fill(ThrustGame.COLORS.UI_TEXT);
        text(`Respawning in ${timeLeft}...`, canvasWidth / 2, canvasHeight / 2);
      }
    }

    // Multiplayer info
    if (this.collaborationManager && this.collaborationManager.isConnected) {
      textSize(12);
      textAlign(RIGHT, TOP);
      const canvasWidth = typeof width !== 'undefined' ? width : 800;
      const playerCount = this.remotePlayers.size + 1;
      fill(0, 0, 0, 150);
      noStroke();
      rect(canvasWidth - 115, 5, 110, 24, 5);
      fill(ThrustGame.COLORS.UI_TEXT);
      text(`Players: ${playerCount}`, canvasWidth - 10, 10);
    }

    pop();
  }

  /**
   * Draws a player ship
   * @param {Object} player - Player object
   * @param {Object} color - Color object {r, g, b} or hex string
   * @param {boolean} showThrust - Whether to show thrust flame
   * @param {boolean} invulnerable - Whether player is invulnerable (flashing effect)
   * @param {string} name - Optional player name to display above ship
   */
  drawPlayer(player, color, showThrust = false, invulnerable = false, name = null) {
    push();
    translate(player.x, player.y);
    rotate(player.angle);

    // Flash effect for invulnerability
    if (invulnerable) {
      const time = typeof millis !== 'undefined' ? millis() : Date.now();
      if (Math.floor(time / 100) % 2 === 0) {
        pop();
        return;
      }
    }

    // Convert color to RGB if it's a hex string
    let r, g, b;
    if (typeof color === 'string') {
      // Parse hex color (e.g., "#ff6464")
      const hex = color.replace('#', '');
      // Validate hex format (should be 6 characters)
      if (hex.length === 6 && /^[0-9A-Fa-f]{6}$/.test(hex)) {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
      } else {
        // Fallback to default remote player color if invalid
        const fallback = ThrustGame.COLORS.PLAYER_REMOTE;
        r = fallback.r;
        g = fallback.g;
        b = fallback.b;
      }
    } else {
      r = color.r;
      g = color.g;
      b = color.b;
    }

    // Draw ship as triangle
    const halfSize = ThrustGame.PLAYER.SIZE / 2;
    noStroke();
    fill(r, g, b);
    triangle(
      ThrustGame.PLAYER.SIZE, 0,
      -halfSize, -halfSize,
      -halfSize, halfSize
    );

    // Draw thrust flame if thrusting
    if (showThrust) {
      const flame = ThrustGame.COLORS.THRUST_FLAME;
      fill(flame.r, flame.g, flame.b);
      const flameLength = ThrustGame.PLAYER.FLAME_BASE_LENGTH + Math.random() * ThrustGame.PLAYER.FLAME_VARIATION;
      triangle(
        -halfSize, -5,
        -halfSize, 5,
        -halfSize - flameLength, 0
      );
    }

    pop();

    // Draw player name above ship (in world space, not rotated).
    // Any player other than the local player is treated as an enemy.
    if (name) {
      push();
      const isEnemy = (player !== this.player);
      fill(isEnemy ? 0 : 255);
      noStroke();
      textAlign(CENTER, BOTTOM);
      textSize(12);
      text(name, player.x, player.y - ThrustGame.PLAYER.SIZE - 5);
      pop();
    }
  }

  /**
   * Draws all bullets with optional viewport culling
   * @param {Object} viewportBounds - Optional viewport bounds for culling {left, right, top, bottom}
   * @param {Function} isInViewport - Optional function to check if position is in viewport
   */
  drawBullets(viewportBounds = null, isInViewport = null) {
    // Local bullets
    noStroke();
    const localColor = ThrustGame.COLORS.BULLET_LOCAL;
    fill(localColor.r, localColor.g, localColor.b);
    for (const bullet of this.bullets) {
      // Skip bullets outside viewport for performance
      if (isInViewport && !isInViewport(bullet.x, bullet.y)) continue;
      circle(bullet.x, bullet.y, ThrustGame.BULLET.SIZE * 2);
    }

    // Remote bullets
    const remoteColor = ThrustGame.COLORS.BULLET_REMOTE;
    fill(remoteColor.r, remoteColor.g, remoteColor.b);
    for (const [bulletId, bullet] of this.remoteBullets) {
      // Skip bullets outside viewport for performance
      if (isInViewport && !isInViewport(bullet.x, bullet.y)) continue;
      circle(bullet.x, bullet.y, ThrustGame.BULLET.SIZE * 2);
    }
  }

  /**
   * Draws explosion animations
   * @param {Object} viewportBounds - Viewport bounds for culling (optional)
   * @param {Function} isInViewport - Function to check if position is in viewport (optional)
   */
  drawExplosions(viewportBounds = null, isInViewport = null) {
    const now = Date.now();

    for (const explosion of this.explosions) {
      // Skip explosions outside viewport for performance
      if (isInViewport && !isInViewport(explosion.x, explosion.y)) continue;

      const elapsed = now - explosion.startTime;
      const progress = elapsed / explosion.duration; // 0 to 1

      // Calculate expanding radius
      const radius = ThrustGame.EXPLOSION.MAX_RADIUS * progress;

      // Calculate fade effect (starts fading at FADE_START progress)
      let alpha = 255;
      if (progress > ThrustGame.EXPLOSION.FADE_START) {
        const fadeProgress = (progress - ThrustGame.EXPLOSION.FADE_START) /
          (1 - ThrustGame.EXPLOSION.FADE_START);
        alpha = 255 * (1 - fadeProgress);
      }

      // Draw expanding red circle
      push();
      noFill();
      stroke(255, 0, 0, alpha); // Red with alpha
      strokeWeight(3);
      circle(explosion.x, explosion.y, radius * 2);

      // Inner circle for more impact
      if (progress < 0.5) {
        strokeWeight(2);
        stroke(255, 100, 0, alpha * 0.7); // Orange
        circle(explosion.x, explosion.y, radius * 1.5);
      }
      pop();
    }
  }

  // ============================================================================
  // MULTIPLAYER
  // ============================================================================

  /**
   * Sets up multiplayer synchronization
   */
  setupMultiplayer() {
    if (!this.collaborationManager || !this.collaborationManager.awareness) {
      return;
    }

    // Only set up once to avoid duplicate event listeners
    if (this.multiplayerInitialized) {
      return;
    }
    this.multiplayerInitialized = true;

    // Initial update to populate remote players
    this.updateRemotePlayers();
  }

  /**
   * Updates remote players based on awareness state
   */
  updateRemotePlayers() {
    // Always update remote players to ensure they're visible even when local player
    // is not in thrust mode. This allows players to see others' spaceships.
    if (!this.collaborationManager || !this.collaborationManager.awareness) {
      return;
    }

    const states = this.collaborationManager.awareness.getStates();
    const myClientId = this.collaborationManager.awareness.clientID;

    // Track which clients are still active
    const activeClients = new Set();

    states.forEach((state, clientId) => {
      // Skip self
      if (clientId === myClientId) return;

      // Check if remote player has thrust game state
      if (state.thrustGame) {
        activeClients.add(clientId);

        // Update or create remote player
        if (!this.remotePlayers.has(clientId)) {
          this.remotePlayers.set(clientId, {
            x: state.thrustGame.x,
            y: state.thrustGame.y,
            vx: state.thrustGame.vx || 0,
            vy: state.thrustGame.vy || 0,
            angle: state.thrustGame.angle,
            alive: state.thrustGame.alive,
            thrusting: state.thrustGame.thrusting || false,
            name: state.user?.name || ThrustGame.DEFAULT_PLAYER_NAME,
            color: state.user?.color || ThrustGame.DEFAULT_PLAYER_COLOR,
            // Interpolation targets - set initial positions to avoid jump
            targetX: state.thrustGame.x,
            targetY: state.thrustGame.y,
            targetAngle: state.thrustGame.angle
          });
        } else {
          const player = this.remotePlayers.get(clientId);

          // Check if player just died (create explosion)
          const wasPreviouslyAlive = player.alive;
          const isNowDead = !state.thrustGame.alive;
          if (wasPreviouslyAlive && isNowDead) {
            // Create explosion at player's current position
            this.createExplosion(player.x, player.y);
          }

          // Store target positions for interpolation
          player.targetX = state.thrustGame.x;
          player.targetY = state.thrustGame.y;
          player.targetAngle = state.thrustGame.angle;
          // Update other non-interpolated properties immediately
          player.vx = state.thrustGame.vx || 0;
          player.vy = state.thrustGame.vy || 0;
          player.alive = state.thrustGame.alive;
          player.thrusting = state.thrustGame.thrusting || false;
          player.name = state.user?.name || ThrustGame.DEFAULT_PLAYER_NAME;
          player.color = state.user?.color || ThrustGame.DEFAULT_PLAYER_COLOR;
        }

        // Update remote bullets from this player
        if (state.thrustGame.bullets && Array.isArray(state.thrustGame.bullets)) {
          // Track current bullet IDs for this client
          const currentBulletIds = new Set(state.thrustGame.bullets.map(b => b.id).filter(id => id !== null && id !== undefined));

          // Remove bullets that are no longer in the update
          for (const [bulletId, bullet] of this.remoteBullets) {
            if (bullet.clientId === clientId && !currentBulletIds.has(bulletId)) {
              this.remoteBullets.delete(bulletId);
            }
          }

          // Add or update current bullets
          for (const bullet of state.thrustGame.bullets) {
            if (bullet.id !== null && bullet.id !== undefined) {
              this.remoteBullets.set(bullet.id, {
                x: bullet.x,
                y: bullet.y,
                vx: bullet.vx,
                vy: bullet.vy,
                lifetime: bullet.lifetime,
                clientId: clientId
              });
            }
          }
        }
      }
    });

    // Remove players that are no longer present
    for (const clientId of this.remotePlayers.keys()) {
      if (!activeClients.has(clientId)) {
        this.remotePlayers.delete(clientId);

        // Also remove their bullets
        for (const [bulletId, bullet] of this.remoteBullets) {
          if (bullet.clientId === clientId) {
            this.remoteBullets.delete(bulletId);
          }
        }
      }
    }
  }

  /**
   * Broadcasts local player state to other players
   */
  broadcastPlayerState() {
    if (!this.collaborationManager || !this.collaborationManager.awareness) {
      return;
    }

    // Detect if player is moving or has any input
    const hasInput = this.keys.left || this.keys.right || this.keys.up || this.keys.down;
    const hasBullets = this.bullets.length > 0;

    // Check if player state has changed significantly
    const p = this.player;
    const currentState = {
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      angle: Math.round(p.angle * 100) / 100,
      alive: p.alive,
      thrusting: this.keys.up,
      bulletCount: this.bullets.length
    };

    // Detect movement by comparing with last broadcast state
    // On first broadcast, treat as movement to ensure initial state is sent
    let hasMovement = !this.lastBroadcastState; // True on first broadcast
    if (this.lastBroadcastState) {
      hasMovement = (
        Math.abs(currentState.x - this.lastBroadcastState.x) > 0.1 ||
        Math.abs(currentState.y - this.lastBroadcastState.y) > 0.1 ||
        Math.abs(currentState.angle - this.lastBroadcastState.angle) > 0.01 ||
        currentState.alive !== this.lastBroadcastState.alive ||
        currentState.thrusting !== this.lastBroadcastState.thrusting ||
        currentState.bulletCount !== this.lastBroadcastState.bulletCount
      );
    }

    const now = Date.now();

    // Update idle state
    if (hasInput || hasBullets || hasMovement) {
      this.lastMovementTime = now;
      this.isIdle = false;
    } else if (now - this.lastMovementTime > 2000) {
      // No movement for 2 seconds = idle
      if (!this.isIdle) {
        // Transition to idle - send one final update
        this.isIdle = true;
      } else {
        // Already idle and sent final update - skip broadcasting
        return;
      }
    }

    // Build the state to broadcast - optimized for bandwidth
    // Round position/angle values to reduce precision (saves bytes in JSON)
    // Validate all values are finite before broadcasting
    if (!Number.isFinite(currentState.x) || !Number.isFinite(currentState.y) ||
      !Number.isFinite(currentState.angle)) {
      // Invalid state - skip broadcasting to prevent NaN/Infinity issues
      return;
    }

    const gameState = {
      x: currentState.x,
      y: currentState.y,
      angle: currentState.angle,
      alive: currentState.alive,
      thrusting: currentState.thrusting,
      // Note: vx/vy removed - only needed locally, remote clients can interpolate
      bullets: this.bullets.map(b => ({
        id: b.id,
        x: Math.round(b.x * 10) / 10,
        y: Math.round(b.y * 10) / 10,
        vx: Math.round(b.vx * 10) / 10,
        vy: Math.round(b.vy * 10) / 10,
        lifetime: b.lifetime
      })).filter(b => Number.isFinite(b.x) && Number.isFinite(b.y)) // Filter invalid bullets
    };

    // Update awareness with thrust game state
    this.collaborationManager.awareness.setLocalStateField('thrustGame', gameState);

    // Save current state for next comparison
    this.lastBroadcastState = currentState;
  }

  /**
   * Broadcasts a fired bullet to other players
   * @param {Object} bullet - Bullet object
   */
  broadcastBullet(bullet) {
    // Bullets are broadcasted as part of player state in broadcastPlayerState
    // The update() method already throttles broadcasts to ~100ms intervals
    // No need to broadcast immediately here - will be sent in next update cycle
  }
}

// Export for use in other modules (if using modules)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ThrustGame;
}
