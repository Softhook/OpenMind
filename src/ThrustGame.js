/**
 * ThrustGame.js - Easter egg mini-game implementation
 * 
 * A simple thrust-based physics game where players control a ship using arrow keys
 * and fire bullets with spacebar. Designed to be toggleable with Ctrl+T and
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
    GROUNDING_NUDGE: 1.2,          // Small downward nudge (pixels) applied when grounded.
    // Must be slightly larger than shortest separation step (1.0) to avoid oscillation.
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

  static HEALTH = {
    RECOVERY_DELAY: 10000,      // Time (ms) since last hit before recovery starts (Match recovery rate)
    RECOVERY_RATE: 10000        // Time (ms) between recovery increments (1 HP per 10s)
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
  static DEFAULT_PLAYER_COLOR = ColorPalette.toHex({ r: 255, g: 100, b: 100, a: 255 });    // Default color for players without a color (red)


  static SPAWN = {
    MAX_ATTEMPTS: 50,        // Maximum attempts to find valid spawn location (increased for reliability)
    SEARCH_RADIUS: 150,      // Radius around box center to search for spawn point
    MIN_DISTANCE_FROM_BOX: 40 // Minimum distance from any box to spawn
  };



  // ============================================================================
  // SINGLETON MANAGEMENT & SOFT DEPENDENCY INTERFACE
  // ============================================================================

  static instance = null;
  static hasRemotePlayers = false;
  static _activeManager = null; // Track which manager we are currently listening to
  static _healingInterval = null; // setInterval handle for post-session box healing

  /**
   * Main game loop - handles updates, drawing, and lifecycle.
   * This is the ONLY method that needs to be called from the main sketch draw loop.
   * Safe to call even if game is not active (zero overhead).
   * @param {CollaborationManager} collaborationManager 
   * @param {MindMap} mindMap 
   */
  static loop(collaborationManager, mindMap) {
    // 1. Dependency injection and state management
    if (!ThrustGame.instance) {
      ThrustGame.instance = new ThrustGame(collaborationManager, mindMap);
    }
    ThrustGame.instance.collaborationManager = collaborationManager;
    ThrustGame.instance.mindMap = mindMap;

    // 2. Setup awareness listener (O(1) event-driven check)
    if (collaborationManager && collaborationManager !== ThrustGame._activeManager) {
      ThrustGame._setupAwarenessListener(collaborationManager);
      ThrustGame._activeManager = collaborationManager;
    }

    // 3. ZERO OVERHEAD DETACHMENT: Dormancy check
    // If not active locally AND no remote players are detectable, detach from hot loop.
    const isLocalActive = ThrustGame.instance && ThrustGame.instance.active;
    if (!isLocalActive && !ThrustGame.hasRemotePlayers) {
      if (window.ExtensionBridge) {
        window.ExtensionBridge.draw = null;
      }
      // MEMORY CLEANUP: Destroy the instance to free up memory
      if (ThrustGame.instance) {
        ThrustGame.instance.destroy();
        ThrustGame.instance = null;
      }
      return;
    }

    // 4. Update Game Logic (only if locally active)
    if (isLocalActive) {
      ThrustGame.instance.update();
    }

    // 5. Update/Interpolate remote players (if local active or remote present)
    ThrustGame.instance.updateRemotePlayers();
    ThrustGame.instance.interpolateRemotePlayers();

    // 6. Draw Game & UI
    ThrustGame.instance.draw();

    if (!isLocalActive) {
      ThrustGame.instance.updateRemoteBullets();
      ThrustGame.instance.updateExplosions();
    }
    ThrustGame.instance.drawUI();
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
      return false; // Not ready yet
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

      // REACTIVATION: If remote players appear and we are dormant, wake up!
      if (foundRemote && window.ExtensionBridge && !window.ExtensionBridge.draw) {
        window.ExtensionBridge.draw = ThrustGame.loop;
        // Poke the loop once to ensure instance is created if needed
        ThrustGame.loop(manager, null);
      }
    };

    // Listen for changes
    manager.awareness.on('change', checkActivity);

    // Initial check
    checkActivity();

    // If activity detected, re-attach to draw loop immediately
    if (ThrustGame.hasRemotePlayers && window.ExtensionBridge) {
      window.ExtensionBridge.draw = ThrustGame.loop;
    }

    // Store cleanup function
    ThrustGame._cleanupListener = () => {
      if (manager && manager.awareness) {
        manager.awareness.off('change', checkActivity);
      }
      // Reset state on cleanup
      ThrustGame.hasRemotePlayers = false;
    };

    return true; // Successfully attached
  }

  /**
   * Manual check for remote activity - used as a fallback for the event listener
   * @param {CollaborationManager} manager 
   */
  static _checkRemoteActivity(manager) {
    if (!manager || !manager.awareness) return;

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
  static handleInput(key, keyCode, mindMap, options = {}) {
    const isCtrl = options.isCtrl ?? ThrustGame._isCtrlPressed();
    const isToggleKey = key === 'T' || key === 't';

    // Toggle with Ctrl+T only; ignore plain capital T to avoid interfering with typing
    if (isToggleKey && isCtrl) {
      ThrustGame.toggleInternal(mindMap);
      return true; // Consume the event
    }

    // Zero-overhead check: If not active, don't even process key inputs
    if (ThrustGame.instance && ThrustGame.instance.active) {
      return ThrustGame.instance.handleKeyPressed(key, keyCode);
    }
    return false;
  }

  /**
   * Detects Ctrl modifier for toggling the game (cross-platform).
   */
  static _isCtrlPressed() {
    try {
      const hasP5 = typeof keyIsDown === 'function';
      const ctrlPressed = hasP5 && keyIsDown(17);

      if (ctrlPressed) return true;

      // Fallback for non-p5 contexts (e.g., unit tests)
      const evt = typeof window !== 'undefined' ? window.event : null;
      if (evt && evt.ctrlKey) return true;
    } catch (e) {
      // Ignore detection errors and treat as not pressed
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
  static toggleInternal(mindMap) {
    if (!ThrustGame.instance) {
      // Create with nulls, they will be injected in loop() or constructor
      // We rely on loop() passing the current managers
      ThrustGame.instance = new ThrustGame(null, mindMap);
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
    this.pendingHitNotifications = [];  // Hit notifications to broadcast
    this.processedHits = new Set();     // Recent hit IDs processed locally
    this.hitBroadcastTimer = 0;         // Counter for rebroadcasting hits

    // Idle detection for bandwidth optimization
    this.lastMovementTime = Date.now();
    this.isIdle = false;
    this.lastBroadcastState = null; // Track last broadcast to detect changes
    this.remotePlayerStateTimestamps = new Map(); // Track last update time from each client
    this.remoteClockOffsets = new Map(); // Track minimum measured delta (clock skew + base plane)

    // Health recovery tracking
    this.lastHealthRecoveryCheck = 0;
    this.damagedBoxIds = new Set(); // Set of IDs for boxes with < 5 health

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
          // Use square root of random for uniform distribution in circle (avoids center clustering)
          // Or simpler: ensure we spawn at least some distance away
          const angle = Math.random() * Math.PI * 2;
          const minR = searchRadius * 0.2; // Don't spawn right at the center average
          const distance = minR + Math.random() * (searchRadius - minR);
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

    // Immediate unthrottled broadcast of respawn state for instant visibility across network
    if (this.collaborationManager && this.collaborationManager.isConnected) {
      this.broadcastPlayerState();
      this.lastBroadcast = Date.now(); // Reset throttle timer
    }
  }

  // ============================================================================
  // GAME LIFECYCLE
  // ============================================================================

  /**
   * Starts the game
   */
  start() {
    this.active = true;

    // ATTACH TO HOT LOOP: Now that we are active, we must be in the draw loop
    if (window.ExtensionBridge) {
      window.ExtensionBridge.draw = ThrustGame.loop;
    }

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

    // ENCAPSULATION: Register health-change callback on MindMap so CollaborationManager
    // can notify us of remote health updates without knowing about ThrustGame.
    // This is the only correct place: ThrustGame owns this registration.
    if (typeof MindMap !== 'undefined') {
      MindMap.onBoxHealthChanged = (boxId, health) => {
        this.notifyBoxHealthChanged(boxId, health);
      };
    }

    // HEAL RESUME: Seed damagedBoxIds from existing map state.
    // When a player exits and re-enters thrust mode, a fresh instance is created
    // with an empty damagedBoxIds set — damaged boxes from the previous session
    // would never heal. One O(N) scan at start() catches them all.
    if (this.mindMap && this.mindMap.boxes) {
      for (const box of this.mindMap.boxes) {
        if (box && box.health !== undefined && box.health < 5) {
          this.damagedBoxIds.add(box.id);
        }
      }
      if (this.damagedBoxIds.size > 0) {
        Utils.Logger.debug(`[ThrustGame] Resuming health recovery for ${this.damagedBoxIds.size} pre-damaged box(es)`);
      }
    }

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
    // If we've already cleaned up (keys is null), don't do it again
    if (!this.keys) return;

    // Set inactive first
    this.active = false;

    // ENCAPSULATION: Deregister our health-change callback so CollaborationManager
    // does not try to call into a destroyed instance.
    if (typeof MindMap !== 'undefined' && MindMap.onBoxHealthChanged) {
      MindMap.onBoxHealthChanged = null;
    }

    // HEAL HANDOFF: If damaged boxes remain, delegate recovery to a self-removing
    // static interval so healing continues after the instance is destroyed.
    // We pass the mindMap reference now because it will be nulled on destroy().
    if (this.damagedBoxIds && this.damagedBoxIds.size > 0 && this.mindMap) {
      ThrustGame._startHealingLoop(this.mindMap, new Set(this.damagedBoxIds));
    }

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

    // Clear recently processed hit IDs
    this.processedHits.clear();
    this.hitBroadcastTimer = 0;
    this.pendingHitNotifications = [];

    // Reset idle detection state to prevent stale data on restart
    this.lastBroadcastState = null;
    this.lastMovementTime = Date.now();
    this.isIdle = false;

    // IMPORTANT: Reset static notification flag to avoid stale state
    ThrustGame.hasRemotePlayers = false;

    Utils.Logger.collab('[ThrustGame] Stopped and cleaned up');
  }

  /**
   * Starts a lightweight static interval that continues health recovery after the
   * game instance has been destroyed. The interval ticks once per second to match
   * normal recovery cadence and removes itself automatically once all tracked boxes
   * are fully healed — no external cleanup required.
   *
   * Design notes:
   * - Static so it survives instance destruction.
   * - Receives a snapshot of damagedBoxIds so the destroyed instance's Set can be GC'd.
   * - If a new session starts before healing is complete, start() seeds damagedBoxIds
   *   from the live map state, making the two paths naturally idempotent.
   * - Only a single interval runs at a time; a pre-existing one is cleared before
   *   starting a new one to prevent duplicate ticks.
   *
   * @param {MindMap} mindMap - Live MindMap reference (held only for this interval's life)
   * @param {Set<string>} boxIds - Snapshot of IDs that still need healing
   */
  static _startHealingLoop(mindMap, boxIds) {
    // Cancel any previous healing loop from an earlier session.
    if (ThrustGame._healingInterval !== null) {
      clearInterval(ThrustGame._healingInterval);
      ThrustGame._healingInterval = null;
    }

    if (!mindMap || boxIds.size === 0) return;

    Utils.Logger.debug(`[ThrustGame] Handing off healing for ${boxIds.size} box(es) to static loop`);

    // FIX #5: Capture the handle locally so the self-cancel inside the callback
    // always refers to THIS interval. If _startHealingLoop is called again before
    // we self-cancel, the static field will point to the new interval; using
    // the local `handle` here means we can't accidentally kill a replacement.
    let handle;
    handle = setInterval(() => {
      // FIX #3: Validate mindMap BEFORE the loop. A stale/gone reference cancels
      // the interval cleanly without falsely draining unhealed IDs from boxIds.
      if (!mindMap || typeof mindMap.getBoxById !== 'function') {
        clearInterval(handle);
        if (ThrustGame._healingInterval === handle) ThrustGame._healingInterval = null;
        Utils.Logger.debug('[HealingLoop] MindMap reference gone — interval cancelled');
        return;
      }

      const now = Date.now();
      const recoveredIds = [];

      for (const boxId of boxIds) {
        // If an active instance exists it owns recovery — drain our IDs and
        // self-cancel so we stay out of the way.
        if (ThrustGame.instance && ThrustGame.instance.active) {
          recoveredIds.push(boxId);
          continue;
        }

        const box = mindMap.getBoxById(boxId);

        // FIX #1: Dead (health <= 0), missing, or deleted boxes must be drained
        // so the interval can always self-cancel. Previously, health === 0 boxes
        // matched neither branch and stayed in the Set forever.
        if (!box || box.isDeleted || (box.health !== undefined && box.health <= 0)) {
          recoveredIds.push(boxId);
          continue;
        }

        if (box.health === undefined || box.health >= 5) {
          // Box was healed externally (e.g. via Yjs sync from another client).
          if (box.health !== undefined) {
            delete box.health;
            delete box.lastHitTime;
            // FIX #4: Push the property deletion back to Yjs so the document
            // and the in-memory object don't diverge after a remote heal.
            if (typeof MindMap !== 'undefined' && MindMap.onBoxChange) {
              MindMap.onBoxChange(box);
            }
          }
          recoveredIds.push(boxId);
          continue;
        }

        if (box.health > 0 && box.lastHitTime > 0 &&
            now - box.lastHitTime >= ThrustGame.HEALTH.RECOVERY_DELAY) {
          box.health++;
          box.lastHitTime = now - (ThrustGame.HEALTH.RECOVERY_DELAY - ThrustGame.HEALTH.RECOVERY_RATE);

          Utils.Logger.debug(`[HealingLoop] Box ${box.id} recovered to health ${box.health}`);

          if (box.health >= 5) {
            delete box.health;
            delete box.lastHitTime;
            recoveredIds.push(boxId);
          }

          // FIX #2: Persist via the collaboration channel when online.
          // When offline (MindMap.onBoxChange is null), the in-memory mutation is
          // the only state that can be saved; this matches the behaviour of the live
          // updateHealthRecovery, and is a documented gap: a hard refresh while
          // offline will read stale health from localStorage until Yjs reconciles.
          if (typeof MindMap !== 'undefined' && MindMap.onBoxChange) {
            MindMap.onBoxChange(box);
          }
        }
      }

      for (const id of recoveredIds) {
        boxIds.delete(id);
      }

      // Self-destruct once all boxes are handled.
      // FIX #5: Use the locally-captured `handle`, not ThrustGame._healingInterval,
      // so a concurrent restart can't cause us to cancel the replacement interval.
      if (boxIds.size === 0) {
        clearInterval(handle);
        if (ThrustGame._healingInterval === handle) ThrustGame._healingInterval = null;
        Utils.Logger.debug('[HealingLoop] All boxes healed — interval removed');
      }
    }, 1000); // Tick once per second, matching normal recovery cadence

    ThrustGame._healingInterval = handle;
  }

  /**
   * Fully destroys the game instance and cleans up static references
   */
  destroy() {
    // Only call stop if not already fully stopped/inactive
    // This prevents double "Stopped and cleaned up" logs
    if (this.active || this.keys) {
      this.stop();
    }

    // Clear static references
    if (ThrustGame.instance === this) {
      ThrustGame.instance = null;
    }

    // Explicitly nullify references to help GC
    this.collaborationManager = null;
    this.mindMap = null;

    // Ensure keys are nulled to mark as destroyed/cleaned up for idempotent stop()
    this.keys = null;
  }

  /**
   * Handles respawn timing when player is dead
   * Called even when not actively playing to handle respawn after being shot
   */
  updateRespawn() {
    if (!this.player.alive) {
      if (Date.now() >= this.player.respawnTime) {
        this.respawnPlayer();
      }
    }
  }

  /**
   * Updates game state (physics, collisions, etc.)
   */
  update() {
    if (!this.active) return;

    // Sync keyboard state to catch any missed events
    this.syncKeyboardState();

    // Handle respawn timing
    this.updateRespawn();

    // ALWAYS update these even if dead, so we can see the battle continue
    this.updateBullets();
    this.updateExplosions();
    this.updateHealthRecovery();

    // Broadcast state to multiplayer even if dead (to sync "alive: false" status)
    if (this.collaborationManager && this.collaborationManager.isConnected) {
      const now = Date.now();
      if (!this.lastBroadcast || now - this.lastBroadcast > 100) {
        this.broadcastPlayerState();
        this.lastBroadcast = now;
      }
    }

    if (!this.player.alive) {
      return;
    }

    // Update player physics
    this.updatePlayerPhysics();

    // Center camera on player's spaceship to keep it in the center of the screen
    // Only do this if NOT panning, to allow user to look around
    if (typeof CameraUtils !== 'undefined' && typeof width !== 'undefined' && typeof height !== 'undefined') {
      if (!CameraUtils.isPanning) {
        CameraUtils.centerOn(this.player.x, this.player.y, width, height);
      }
    }

    // Check collisions
    this.checkCollisions();
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

              // Fix: Always apply separation, even when grounding, to prevent the "pinning" effect
              p.x += separation.x;
              p.y += separation.y;

              // Check if ship should be grounded (resting on top of box)
              // We only ground if moving slowly downwards AND being pushed up AND NOT thrusting up
              if (velocityMagnitude < phys.GROUNDING_VELOCITY && isBeingPushedUp && p.vy >= 0 && !this.keys.up) {
                // Low velocity collision from above - ground the ship
                p.vx = 0;
                p.vy = 0;
                p.grounded = true;
                // Separation already applied above
              } else {
                // Threshold for bounce slightly increased to match grounding for stability
                if (velocityMagnitude > 1.0) {
                  // Significant velocity - bounce
                  p.vx *= -phys.BOUNCE_AMOUNT;
                  p.vy *= -phys.BOUNCE_AMOUNT;
                } else {
                  // Low velocity - dampen to zero to avoid jitters
                  p.vx = 0;
                  p.vy = 0;
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
            // Static rest: we stay grounded if the probe still hits something,
            // but we NO LONGER move the ship's actual position (vibration fix).
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
    // 1. Iterative search with increasing magnitudes
    // This allows resolving deep penetrations (e.g. from high speed or rotation)
    // Starting with 1.0 ensures we don't jump too far when clearing light overlaps
    const magnitudes = [1, 2, 5, 10, 20];
    const directions = [
      { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 },    // Cardinals
      { x: -0.707, y: -0.707 }, { x: 0.707, y: -0.707 },                  // Diagonals
      { x: -0.707, y: 0.707 }, { x: 0.707, y: 0.707 }
    ];

    for (const mag of magnitudes) {
      for (const dir of directions) {
        const testPlayer = {
          x: player.x + dir.x * mag,
          y: player.y + dir.y * mag,
          angle: player.angle
        };

        const testVertices = ThrustGame.getShipTriangleVertices(testPlayer);
        if (!ThrustGame.triangleBoxCollision(testVertices, box)) {
          return { x: dir.x * mag, y: dir.y * mag };
        }
      }
    }

    // 2. Fallback: Brute force escape from box center
    // If cardinal searches fail, push directly away from the box's center
    const dx = player.x - box.x;
    const dy = player.y - box.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0) {
      const dirX = dx / dist;
      const dirY = dy / dist;

      // Try one large push along this vector
      const escapeMag = 30;
      const testPlayer = {
        x: player.x + dirX * escapeMag,
        y: player.y + dirY * escapeMag,
        angle: player.angle
      };

      if (!ThrustGame.triangleBoxCollision(ThrustGame.getShipTriangleVertices(testPlayer), box)) {
        return { x: dirX * escapeMag, y: dirY * escapeMag };
      }
    }

    return null; // Truly stuck (should be rare now)
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

    // 2. Update remote bullets
    this.updateRemoteBullets();
  }

  /**
   * Updates remote bullets independently. 
   * Extracted from updateBullets to allow observers to see smooth movement.
   */
  updateRemoteBullets() {
    for (const [id, bullet] of this.remoteBullets) {
      // Local physics for remote bullets to ensure smooth movement between updates.
      // Also decrement lifetime locally so they expire naturally if a client drops.

      bullet.x += bullet.vx;
      bullet.y += bullet.vy;

      // Interpolate towards target (smooth out jitter and drift)
      // Since trajectory is a line at known speed, we lerp to corrected path
      const lerpFactor = 0.2;
      if (Number.isFinite(bullet.targetX) && Number.isFinite(bullet.targetY)) {
        // Advance target position alongside bullet BEFORE lerp so we don't create "velocity drag"
        bullet.targetX += bullet.vx;
        bullet.targetY += bullet.vy;

        bullet.x += (bullet.targetX - bullet.x) * lerpFactor;
        bullet.y += (bullet.targetY - bullet.y) * lerpFactor;
      }

      bullet.lifetime--;

      if (bullet.lifetime <= 0) {
        this.remoteBullets.delete(id);
        continue;
      }

      // Check for box collisions locally for visual consistency
      const hitBox = this.checkBulletBoxCollision(bullet);
      if (hitBox) {
        this.applyBulletForceToBox(hitBox, bullet);
        this.remoteBullets.delete(id);
        continue;
      }

      // Check if this remote bullet hits US
      if (this.player.alive && Date.now() > this.player.invulnerableUntil) {
        if (this.checkBulletHit(bullet, this.player.x, this.player.y)) {
          this.handlePlayerDeath();
          this.remoteBullets.delete(id);
        }
      }
    }
  }

  /**
   * Periodically recovers health for damaged boxes that haven't been hit for a while
   * Optimized to only iterate over known damaged boxes
   */
  updateHealthRecovery() {
    const now = Date.now();
    // Throttle check to once per second for performance
    if (now - this.lastHealthRecoveryCheck < 1000) return;
    this.lastHealthRecoveryCheck = now;

    if (!this.mindMap) return;
    
    // ZERO OVERHEAD: We no longer scan all boxes (O(N)) every second.
    // Instead, we rely on event-driven notifications from CollaborationManager
    // or local hits to populate this.damagedBoxIds. This ensures health recovery
    // logic only consumes CPU cycles proportional to actual damage (O(D)).

    if (this.damagedBoxIds.size === 0) return;

    // Track boxes that have fully recovered
    const recoveredIds = [];

    for (const boxId of this.damagedBoxIds) {
      const box = this.mindMap.getBoxById(boxId);

      // Clean up if box was deleted externally or doesn't exist
      if (!box) {
        recoveredIds.push(boxId);
        continue;
      }

      if (box.health !== undefined && box.health > 0 && box.health < 5 && box.lastHitTime > 0) {
        if (now - box.lastHitTime >= ThrustGame.HEALTH.RECOVERY_DELAY) {
          // Increment health
          box.health++;

          // Adjust lastHitTime to schedule the next recovery point based on RECOVERY_RATE
          box.lastHitTime = now - (ThrustGame.HEALTH.RECOVERY_DELAY - ThrustGame.HEALTH.RECOVERY_RATE);

          Utils.Logger.debug(`[Box] Recovered health to ${box.health} for box ${box.id}`);

          // If fully recovered, restore lazy-init state (zero overhead for undamaged boxes)
          if (box.health >= 5) {
            delete box.health;
            delete box.lastHitTime;
            recoveredIds.push(boxId);
          }

          // Trigger persistent sync for health recovery
          if (typeof MindMap !== 'undefined' && MindMap.onBoxChange) {
            MindMap.onBoxChange(box);
          }
        }
      } else if (box.health === undefined || box.health >= 5) {
        // Already healed or reset elsewhere — clean up tracking
        if (box.health !== undefined) {
          delete box.health;
          delete box.lastHitTime;
        }
        recoveredIds.push(boxId);
      }
    }

    // Remove recovered/deleted boxes from tracking
    for (const id of recoveredIds) {
      this.damagedBoxIds.delete(id);
    }
  }

  /**
   * Notifies the game that a box's health has changed (e.g. from a remote update).
   * This allows the game to track damaged boxes without expensive full-map scans.
   * @param {string} boxId - ID of the box
   * @param {number} health - Current health value
   */
  notifyBoxHealthChanged(boxId, health) {
    if (health !== undefined && health < 5) {
      if (!this.damagedBoxIds.has(boxId)) {
        Utils.Logger.debug(`[ThrustGame] Started tracking damaged box ${boxId} (health: ${health})`);
        this.damagedBoxIds.add(boxId);
      }
    } else {
      if (this.damagedBoxIds.has(boxId)) {
        Utils.Logger.debug(`[ThrustGame] Stopped tracking box ${boxId} (fully healed or reset)`);
        this.damagedBoxIds.delete(boxId);
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

    // Reduce box health
    if (typeof box.reduceHealth === 'function') {
      box.reduceHealth();

      // Track damaged box for optimized recovery loop
      if (box.health !== undefined && box.health < 5) {
        this.damagedBoxIds.add(box.id);
      } else {
        this.damagedBoxIds.delete(box.id);
      }
    }

    // IMPORTANT: Also update targetX/targetY to prevent interpolation snap-back
    // TextBox interpolates towards these targets, so they must match the new position
    if (typeof box.targetX !== 'undefined' && typeof box.targetY !== 'undefined') {
      box.targetX = box.x;
      box.targetY = box.y;
    }

    // Sync position + health in a SINGLE Yjs write via collaborationManager.
    // _boxToYjsData bundles all box state (position, health) so this one call
    // is authoritative. The guard inside syncBoxToYjs handles deleted boxes safely.
    // Fallback to MindMap.onBoxChange when not connected (offline/solo play).
    if (this.collaborationManager && this.collaborationManager.isConnected) {
      if (box.health > 0) {
        // Box is still alive: sync position + updated health together
        this.collaborationManager.syncBoxToYjs(box, false);
      }
      // If box.health === 0, reduceHealth() already triggered deletion via _performBoxDeletion.
      // syncBoxToYjs would be a no-op anyway (box removed from register), but skip it explicitly.
    } else if (box.health > 0 && typeof MindMap !== 'undefined' && MindMap.onBoxChange) {
      // Offline fallback: notify any local listener of the position/health change
      MindMap.onBoxChange(box);
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
          // Hit detected! Increment score and create explosion for immediate feedback
          // NOTE: We do NOT remove the bullet here - the remote player needs to detect
          // the hit on their side to actually die. The bullet will be removed naturally
          // when it times out or hits a box. We mark it as "scored" to avoid double-counting.
          if (!bullet.scored) {
            this.score++;
            bullet.scored = true; // Mark to prevent double-counting

            // Create explosion at remote player's position for immediate visual feedback
            // Only create one explosion per bullet to avoid multiple explosions for overlapping players
            this.createExplosion(remotePlayer.x, remotePlayer.y);
          }

          // Broadcast that we hit this player (for frozen/inactive tabs)
          // This is outside the scored check so each hit player gets notified
          this.broadcastHit(clientId);

          bulletHit = true;
        }
      }
    }

    // Check remote bullets against local player
    if (this.player.alive && Date.now() > this.player.invulnerableUntil) {
      for (const [bulletId, bullet] of this.remoteBullets) {
        if (this.checkBulletHit(bullet, this.player.x, this.player.y)) {
          // Hit! Player dies and respawns
          this.handlePlayerDeath();

          // Remove the bullet that hit us
          this.remoteBullets.delete(bulletId);
          break;
        }
      }
    }
  }

  /**
   * Checks remote bullets against local player only
   * This is called even when not actively playing to allow being hit by remote bullets
   */
  /**
   * Handles player death, including explosion and respawn timer
   */
  handlePlayerDeath() {
    this.player.alive = false;
    this.player.respawnTime = Date.now() + ThrustGame.PLAYER.RESPAWN_TIME;
    this.deaths++;
    this.createExplosion(this.player.x, this.player.y);

    // Immediate unthrottled broadcast of death state for instant visibility suppression
    if (this.collaborationManager && this.collaborationManager.isConnected) {
      this.broadcastPlayerState();
      this.lastBroadcast = Date.now(); // Reset throttle timer
    }
  }

  /**
   * Checks if a bullet hits a target, including trajectory-based detection
   * @param {Object} bullet - The bullet to check
   * @param {number} targetX - Target X position
   * @param {number} targetY - Target Y position
   * @returns {boolean} True if bullet hit the target
   */
  checkBulletHit(bullet, targetX, targetY) {
    // Check current position
    const dx = bullet.x - targetX;
    const dy = bullet.y - targetY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < ThrustGame.COLLISION.RADIUS) {
      return true;
    }

    // Also check if bullet trajectory passes through target
    // This handles fast-moving bullets that might skip over target between frames
    if (bullet.vx || bullet.vy) {
      // Calculate where bullet was last frame (approximately)
      const prevX = bullet.x - bullet.vx;
      const prevY = bullet.y - bullet.vy;

      // Check if line segment from prevPos to currentPos intersects target circle
      const closestPoint = this.getClosestPointOnLineSegment(
        prevX, prevY, bullet.x, bullet.y,
        targetX, targetY
      );

      const closestDx = closestPoint.x - targetX;
      const closestDy = closestPoint.y - targetY;
      const closestDist = Math.sqrt(closestDx * closestDx + closestDy * closestDy);

      if (closestDist < ThrustGame.COLLISION.RADIUS) {
        return true;
      }
    }

    return false;
  }

  /**
   * Gets the closest point on a line segment to a given point
   * Used for bullet trajectory collision detection
   */
  getClosestPointOnLineSegment(x1, y1, x2, y2, px, py) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      // Line segment is a point
      return { x: x1, y: y1 };
    }

    // Calculate t parameter (0 to 1) representing position on line segment
    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t)); // Clamp to [0, 1]

    return {
      x: x1 + t * dx,
      y: y1 + t * dy
    };
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
      if (!player.alive) continue;

      // Defensive check to prevent NaN propagation which could lead to infinite loops
      if (!Number.isFinite(player.x) || !Number.isFinite(player.y) || !Number.isFinite(player.angle) ||
        !Number.isFinite(player.targetX) || !Number.isFinite(player.targetY) || !Number.isFinite(player.targetAngle)) {
        continue;
      }

      // Linear interpolation for position
      player.x += (player.targetX - player.x) * interpolationFactor;
      player.y += (player.targetY - player.y) * interpolationFactor;

      // Robust angular interpolation (No-Hang logic using modulo)
      let angleDiff = player.targetAngle - player.angle;

      // Normalize angle difference to [-PI, PI] using math instead of loops
      const TWO_PI = Math.PI * 2;
      angleDiff = ((angleDiff + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;

      player.angle += angleDiff * interpolationFactor;

      // Normalize player angle to [0, 2PI]
      player.angle = (player.angle % TWO_PI + TWO_PI) % TWO_PI;
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

    return true; // Key handled
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
    // Early exit if no remote players and not active locally
    if (this.remotePlayers.size === 0 && !this.active) {
      return;
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
        this.drawPlayer(
          remotePlayer,
          remotePlayer.color,
          remotePlayer.thrusting,
          remotePlayer.isInvulnerable,
          remotePlayer.name
        );
      }
    }

    // Draw all bullets (both local and remote) with viewport culling
    // This ensures remote combat is visible even when not actively playing
    this.drawBullets(viewportBounds, isInViewport);

    // Draw explosions for all players
    this.drawExplosions(viewportBounds, isInViewport);

    // Only draw local player and UI if we're actually in thrust mode
    if (!this.active) return;

    // Draw local player (always draw, even if off-screen, for consistency)
    if (this.player.alive) {
      const isInvulnerable = Date.now() < this.player.invulnerableUntil;
      this.drawPlayer(this.player, ThrustGame.COLORS.PLAYER_LOCAL, this.keys.up, isInvulnerable);
    }
  }

  /**
   * Draws UI overlay in screen space
   * This should be called OUTSIDE the world transform
   */
  drawUI() {
    if (!this.active) return;

    push();
    resetMatrix();
    rectMode(CORNER);
    textAlign(LEFT, TOP);
    imageMode(CORNER); // Safety

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
    text('Ctrl+T: Exit', 10, 46);

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

    // Draw player name above ship (stays upright, not rotated with ship)
    if (name) {
      push();
      fill(0); // Black for readability on light backgrounds
      noStroke();
      textAlign(CENTER, BOTTOM);
      textSize(12);
      text(name, 0, -ThrustGame.PLAYER.SIZE - 5);
      pop();
    }

    // Draw ship (rotated)
    push();
    rotate(player.angle);

    // Flash effect for invulnerability
    if (invulnerable) {
      const time = typeof millis !== 'undefined' ? millis() : Date.now();
      if (Math.floor(time / 100) % 2 === 0) {
        pop(); // pop rotate
        pop(); // pop translate
        return;
      }
    }

    // Handle color reliably
    let r = 255, g = 255, b = 255;
    if (typeof color === 'string') {
      const hex = color.replace('#', '');
      if (hex.length === 6 && /^[0-9A-Fa-f]{6}$/.test(hex)) {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
      } else {
        const fb = ThrustGame.COLORS.PLAYER_REMOTE;
        r = fb.r; g = fb.g; b = fb.b;
      }
    } else if (color && typeof color === 'object') {
      r = Number.isFinite(color.r) ? color.r : 255;
      g = Number.isFinite(color.g) ? color.g : 255;
      b = Number.isFinite(color.b) ? color.b : 255;
    }

    // Draw triangle ship
    const half = ThrustGame.PLAYER.SIZE / 2;
    noStroke();
    fill(r, g, b);
    triangle(ThrustGame.PLAYER.SIZE, 0, -half, -half, -half, half);

    // Draw flame
    if (showThrust) {
      const f = ThrustGame.COLORS.THRUST_FLAME;
      fill(f.r, f.g, f.b);
      triangle(-half, -5, -half, 5, -half - (ThrustGame.PLAYER.FLAME_BASE_LENGTH + Math.random() * 10), 0);
    }

    pop(); // pop rotate
    pop(); // pop translate
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
      if (isInViewport && !isInViewport(bullet.x, bullet.y)) continue;
      circle(bullet.x, bullet.y, ThrustGame.BULLET.SIZE * 2);
    }

    // Remote bullets
    const remoteColor = ThrustGame.COLORS.BULLET_REMOTE;
    fill(remoteColor.r, remoteColor.g, remoteColor.b);
    for (const [bulletId, bullet] of this.remoteBullets) {
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
        // Validate state data before processing
        // If coordinates are missing or invalid, skip this player to avoid NaN propagation
        if (!state.thrustGame ||
          !Number.isFinite(state.thrustGame.x) ||
          !Number.isFinite(state.thrustGame.y) ||
          !Number.isFinite(state.thrustGame.angle)) {
          return;
        }

        activeClients.add(clientId);

        // Calculate latency for this update
        const now = Date.now();
        const updateTime = state.thrustGame.t || now;

        // Out-of-order packet protection: Skip if we've already seen a newer update from this client
        if (this.remotePlayerStateTimestamps.has(clientId)) {
          if (updateTime <= this.remotePlayerStateTimestamps.get(clientId)) {
            return;
          }
        }
        this.remotePlayerStateTimestamps.set(clientId, updateTime);

        // Adaptive Clock Synchronization (minDelta tracking)
        // rawDelta = local - remote. Represents clock skew + network latency.
        // The minimum rawDelta seen from a client is our baseline (best-case speed of light).
        const rawDelta = now - updateTime;
        if (!this.remoteClockOffsets.has(clientId) || rawDelta < this.remoteClockOffsets.get(clientId)) {
          this.remoteClockOffsets.set(clientId, rawDelta);
        }

        // Relative Latency = current delay minus the best-case baseline.
        // This isolates "the time it takes" (jitter + extra lag) from absolute clock skew.
        const minDelta = this.remoteClockOffsets.get(clientId);
        const effectiveLatencyMs = rawDelta - minDelta;

        // Safety clamp: Limit extrapolation to 120 frames (2 seconds).
        // This ensures the bullet can travel its full lifetime even in high-latency scenarios.
        const latencyFrames = Math.min(120, effectiveLatencyMs / ThrustGame.TIMING.FRAME_TIME_MS);

        // Update or create remote player
        if (!this.remotePlayers.has(clientId)) {
          this.remotePlayers.set(clientId, {
            x: state.thrustGame.x,
            y: state.thrustGame.y,
            vx: Number.isFinite(state.thrustGame.vx) ? state.thrustGame.vx : 0,
            vy: Number.isFinite(state.thrustGame.vy) ? state.thrustGame.vy : 0,
            angle: state.thrustGame.angle,
            alive: state.thrustGame.alive !== false, // Default to true
            thrusting: !!state.thrustGame.thrusting,
            isInvulnerable: !!state.thrustGame.isInvulnerable,
            name: (state.user?.name || ThrustGame.DEFAULT_PLAYER_NAME).substring(0, 20),
            color: state.user?.color || ThrustGame.DEFAULT_PLAYER_COLOR,
            // Interpolation targets
            targetX: state.thrustGame.x,
            targetY: state.thrustGame.y,
            targetAngle: state.thrustGame.angle
          });
        } else {
          const player = this.remotePlayers.get(clientId);

          // Check if player just died (create explosion)
          const wasPreviouslyAlive = player.alive;
          const isNowDead = state.thrustGame.alive === false;
          if (wasPreviouslyAlive && isNowDead) {
            this.createExplosion(player.x, player.y);
          }

          // Update interpolation targets
          player.targetX = state.thrustGame.x;
          player.targetY = state.thrustGame.y;
          player.targetAngle = state.thrustGame.angle;

          // Update non-interpolated properties
          player.vx = Number.isFinite(state.thrustGame.vx) ? state.thrustGame.vx : 0;
          player.vy = Number.isFinite(state.thrustGame.vy) ? state.thrustGame.vy : 0;
          player.alive = state.thrustGame.alive !== false;
          player.thrusting = !!state.thrustGame.thrusting;
          player.isInvulnerable = !!state.thrustGame.isInvulnerable;
          player.name = (state.user?.name || ThrustGame.DEFAULT_PLAYER_NAME).substring(0, 20);
          player.color = state.user?.color || ThrustGame.DEFAULT_PLAYER_COLOR;
        }

        // Efficiently update remote bullets from this player
        if (state.thrustGame.bullets && Array.isArray(state.thrustGame.bullets)) {
          const currentBulletIds = new Set();
          for (const b of state.thrustGame.bullets) {
            if (b.id) {
              currentBulletIds.add(b.id);

              // Extrapolate current position based on latency
              const extrapolatedX = b.x + b.vx * latencyFrames;
              const extrapolatedY = b.y + b.vy * latencyFrames;
              const adjustedLifetime = b.lifetime - latencyFrames;

              // Don't add bullets that have already expired due to latency
              if (adjustedLifetime <= 0) continue;

              if (!this.remoteBullets.has(b.id)) {
                // NEW bullet: Initialize with extrapolated position
                this.remoteBullets.set(b.id, {
                  x: extrapolatedX,
                  y: extrapolatedY,
                  vx: b.vx,
                  vy: b.vy,
                  targetX: extrapolatedX,
                  targetY: extrapolatedY,
                  lifetime: adjustedLifetime,
                  clientId: clientId
                });
              } else {
                // EXISTING bullet: Update target and physics, but don't snap x,y
                const bullet = this.remoteBullets.get(b.id);
                bullet.targetX = extrapolatedX;
                bullet.targetY = extrapolatedY;
                bullet.vx = b.vx;
                bullet.vy = b.vy;
                bullet.lifetime = adjustedLifetime;
              }
            }
          }

          // Clean up stale bullets for THIS client ONLY
          for (const [id, bullet] of this.remoteBullets) {
            if (bullet.clientId === clientId && !currentBulletIds.has(id)) {
              this.remoteBullets.delete(id);
            }
          }
        }

        // Process hit notifications from this remote player
        // This handles the case where our tab was frozen/inactive and we missed the collision
        if (state.thrustGame.hitNotifications && Array.isArray(state.thrustGame.hitNotifications)) {
          for (const hit of state.thrustGame.hitNotifications) {
            // Use unique hit ID to prevent duplicate processing
            if (hit.id && this.processedHits.has(hit.id)) continue;

            if (hit.target === myClientId && this.player.alive && Date.now() > this.player.invulnerableUntil) {
              if (hit.id) {
                this.processedHits.add(hit.id);
                // Prune processed hits occasionally
                if (this.processedHits.size > 100) this.processedHits.clear();
              }

              this.handlePlayerDeath();
              break;
            }
          }
        }

        // Health updates are now handled via persistent Yjs maps in CollaborationManager
        // Remote awareness health updates are deprecated to ensure persistence for new players
      }
    });

    // Sync the static flag with current reality
    // This provides a redundant update path to avoid deadlocks
    ThrustGame.hasRemotePlayers = (activeClients.size > 0);

    // Remove remote players who are no longer in awareness or no longer in thrust mode
    for (const clientId of this.remotePlayers.keys()) {
      if (!activeClients.has(clientId)) {
        this.remotePlayers.delete(clientId);
        this.remotePlayerStateTimestamps.delete(clientId);
        this.remoteClockOffsets.delete(clientId);

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
      isInvulnerable: Date.now() < p.invulnerableUntil,
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
      t: now, // Timestamp for latency calculation
      x: currentState.x,
      y: currentState.y,
      angle: currentState.angle,
      alive: currentState.alive,
      isInvulnerable: currentState.isInvulnerable,
      thrusting: currentState.thrusting,
      bullets: this.bullets.map(b => ({
        id: b.id,
        x: Math.round(b.x * 10) / 10,
        y: Math.round(b.y * 10) / 10,
        vx: Math.round(b.vx * 10) / 10,
        vy: Math.round(b.vy * 10) / 10,
        lifetime: b.lifetime
      })).filter(b => Number.isFinite(b.x) && Number.isFinite(b.y)),
      hitNotifications: this.pendingHitNotifications || []
      // Note: boxHealths removed from awareness; now handled via persistent Yjs maps
    };

    // Update awareness with thrust game state
    this.collaborationManager.awareness.setLocalStateField('thrustGame', gameState);

    // Persist notifications for several cycles to ensure delivery
    if (this.hitBroadcastTimer > 0) {
      this.hitBroadcastTimer--;
    } else {
      this.pendingHitNotifications = [];
    }

    // Save current state for next comparison
    this.lastBroadcastState = currentState;
  }

  /**
   * Broadcasts that we hit a remote player
   * This ensures the remote player dies even if their tab is frozen/inactive
   * @param {string} targetClientId - The client ID of the player we hit
   */
  broadcastHit(targetClientId) {
    if (!this.pendingHitNotifications) {
      this.pendingHitNotifications = [];
    }

    // Generate unique hit ID to prevent duplicate processing
    const hitId = `hit_${targetClientId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    const MAX_PENDING_HITS = 10;
    if (this.pendingHitNotifications.length < MAX_PENDING_HITS) {
      this.pendingHitNotifications.push({
        id: hitId,
        target: targetClientId,
        timestamp: Date.now()
      });

      // Start/reset rebroadcast timer to ensure delivery to high-latency peers
      this.hitBroadcastTimer = 5; // Broadcast for 5 cycles (approx 500ms)
    }
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

// ============================================================================
// SELF-REGISTRATION (Extension Bridge Integration)
// ============================================================================
{
  if (window.ExtensionBridge) {
    // Register basic input hooks
    window.ExtensionBridge.handleInput = ThrustGame.handleInput;
    window.ExtensionBridge.handleKeyReleased = ThrustGame.handleKeyReleased;

    // Expose active state for UI logic in sketch.js
    ThrustGame.loop.active = false;
    Object.defineProperty(ThrustGame.loop, 'active', {
      get: () => ThrustGame.instance ? ThrustGame.instance.active : false
    });
  }
}
