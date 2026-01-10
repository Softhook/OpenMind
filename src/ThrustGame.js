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
    GRAVITY: 0.03,           // Downward acceleration
    THRUST: 0.2,             // Thrust acceleration magnitude
    ROTATION_SPEED: 0.08,    // Angular velocity for rotation
    MAX_SPEED: 8,            // Maximum velocity magnitude
    DRAG: 0.98               // Velocity dampening per frame
  };

  static PLAYER = {
    SIZE: 15,                // Player ship triangle size (in world space)
    RESPAWN_TIME: 3000,      // Milliseconds before respawn after death
    INVULNERABLE_TIME: 2000, // Invulnerability after spawn (ms)
    FLAME_BASE_LENGTH: 15,   // Base thrust flame length
    FLAME_VARIATION: 5       // Random variation in flame length
  };

  static BULLET = {
    SPEED: 12,               // Bullet velocity
    LIFETIME: 120,           // Frames before bullet expires
    SIZE: 4,                 // Bullet radius
    COOLDOWN: 15             // Frames between shots
  };

  static COLLISION = {
    RADIUS: 15 + 4           // Player size + bullet size for collision detection
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

  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================

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

  /**
   * Static method to toggle thrust game on/off.
   * Creates instance if needed, toggles state, and returns the instance.
   * @param {ThrustGame|null} existingInstance - Existing instance or null
   * @param {CollaborationManager} collaborationManager - Collaboration manager
   * @param {MindMap} mindMap - Mind map reference
   * @returns {ThrustGame} The thrust game instance
   */
  static toggle(existingInstance, collaborationManager, mindMap) {
    let instance = existingInstance;
    
    if (!instance) {
      // Initialize thrust game on first activation
      instance = new ThrustGame(collaborationManager, mindMap);
    }
    
    if (instance.active) {
      // Stop the game
      instance.stop();
    } else {
      // Start the game
      instance.start();
    }
    
    return instance;
  }

  // ============================================================================
  // PLAYER MANAGEMENT
  // ============================================================================

  /**
   * Creates a new player at spawn position
   * @returns {Object} Player object with position, velocity, and state
   */
  createPlayer() {
    // Spawn player in world space - try to find a good location near boxes
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
        // Spawn near the center of boxes, but offset to avoid being inside one
        spawnX = sumX / count - 100;
        spawnY = sumY / count - 100;
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
      invulnerableUntil: Date.now() + ThrustGame.PLAYER.INVULNERABLE_TIME
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

    // Check collisions
    this.checkCollisions();

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

    // Apply rotation
    if (this.keys.left) {
      p.angle -= phys.ROTATION_SPEED;
    }
    if (this.keys.right) {
      p.angle += phys.ROTATION_SPEED;
    }

    // Apply thrust in the direction the ship is facing
    if (this.keys.up) {
      p.vx += Math.cos(p.angle) * phys.THRUST;
      p.vy += Math.sin(p.angle) * phys.THRUST;
    }

    // Optional downward thrust (reverse)
    if (this.keys.down) {
      p.vx -= Math.cos(p.angle) * phys.THRUST * 0.5;
      p.vy -= Math.sin(p.angle) * phys.THRUST * 0.5;
    }

    // Apply gravity
    p.vy += phys.GRAVITY;

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

    // Store previous position for collision resolution
    const prevX = p.x;
    const prevY = p.y;

    // Update position
    p.x += p.vx;
    p.y += p.vy;

    // Check collision with boxes
    if (this.mindMap && this.mindMap.boxes) {
      const playerRadius = ThrustGame.PLAYER.SIZE;

      for (const box of this.mindMap.boxes) {
        if (!box) continue;

        // Get box bounds
        const boxLeft = box.x - box.width / 2;
        const boxRight = box.x + box.width / 2;
        const boxTop = box.y - box.height / 2;
        const boxBottom = box.y + box.height / 2;

        // Check if player circle collides with box rectangle
        const closestX = Math.max(boxLeft, Math.min(p.x, boxRight));
        const closestY = Math.max(boxTop, Math.min(p.y, boxBottom));

        const distX = p.x - closestX;
        const distY = p.y - closestY;
        const distSq = distX * distX + distY * distY;

        if (distSq < playerRadius * playerRadius) {
          // Collision! Revert to previous position and bounce
          p.x = prevX;
          p.y = prevY;

          // Bounce effect - reverse velocity with damping
          const bounceAmount = 0.5;
          p.vx *= -bounceAmount;
          p.vy *= -bounceAmount;

          break; // Only handle one collision per frame
        }
      }
    }

    // No screen wrapping - player stays in world space
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

      // Check collision with boxes
      if (this.checkBulletBoxCollision(bullet)) {
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
      if (this.checkBulletBoxCollision(bullet)) {
        this.remoteBullets.delete(bulletId);
      }
    }
  }

  /**
   * Checks if a bullet collides with any box
   * @param {Object} bullet - Bullet to check
   * @returns {boolean} true if bullet collides with a box
   */
  checkBulletBoxCollision(bullet) {
    if (!this.mindMap || !this.mindMap.boxes) return false;

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
        return true; // Collision detected
      }
    }

    return false;
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
          // In multiplayer, the hit player would handle their own death
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
          // Remove the bullet that hit us
          this.remoteBullets.delete(bulletId);
          break;
        }
      }
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

    // Listen for awareness changes to get remote player updates
    this.collaborationManager.awareness.on('change', () => {
      if (this.active) {
        this.updateRemotePlayers();
      }
    });

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
            color: state.user?.color || ThrustGame.DEFAULT_PLAYER_COLOR
          });
        } else {
          const player = this.remotePlayers.get(clientId);
          player.x = state.thrustGame.x;
          player.y = state.thrustGame.y;
          player.vx = state.thrustGame.vx || 0;
          player.vy = state.thrustGame.vy || 0;
          player.angle = state.thrustGame.angle;
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
    let hasMovement = false;
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
      }))
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
