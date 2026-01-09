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
    GRAVITY: 0.15,           // Downward acceleration
    THRUST: 0.3,             // Thrust acceleration magnitude
    ROTATION_SPEED: 0.08,    // Angular velocity for rotation
    MAX_SPEED: 8,            // Maximum velocity magnitude
    DRAG: 0.98               // Velocity dampening per frame
  };
  
  static PLAYER = {
    SIZE: 20,                // Player ship triangle size
    RESPAWN_TIME: 3000,      // Milliseconds before respawn after death
    INVULNERABLE_TIME: 2000  // Invulnerability after spawn (ms)
  };
  
  static BULLET = {
    SPEED: 12,               // Bullet velocity
    LIFETIME: 120,           // Frames before bullet expires
    SIZE: 4,                 // Bullet radius
    COOLDOWN: 15             // Frames between shots
  };
  
  static TIMING = {
    FRAME_TIME_MS: 1000 / 60  // Milliseconds per frame at 60fps
  };
  
  static COLORS = {
    BACKGROUND: { r: 10, g: 10, b: 30 },       // Dark space background
    PLAYER_LOCAL: { r: 100, g: 200, b: 255 },  // Cyan for local player
    PLAYER_REMOTE: { r: 255, g: 100, b: 100 }, // Red for remote players
    BULLET_LOCAL: { r: 255, g: 255, b: 100 },  // Yellow bullets
    BULLET_REMOTE: { r: 255, g: 100, b: 100 }, // Red bullets
    THRUST_FLAME: { r: 255, g: 150, b: 50 },   // Orange thrust flame
    UI_TEXT: 255                                // White text
  };
  
  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================
  
  /**
   * Creates a new ThrustGame instance
   * @param {CollaborationManager} collaborationManager - Optional collaboration manager for multiplayer
   */
  constructor(collaborationManager = null) {
    this.collaborationManager = collaborationManager;
    this.active = false;
    
    // Local player state
    this.player = this.createPlayer();
    
    // Game objects
    this.bullets = [];  // Local bullets
    this.remotePlayers = new Map();  // Remote players by clientId
    this.remoteBullets = new Map();  // Remote bullets by bulletId
    
    // Input state
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
    
    // Setup multiplayer if available
    if (this.collaborationManager && this.collaborationManager.isConnected) {
      this.setupMultiplayer();
    }
  }
  
  // ============================================================================
  // PLAYER MANAGEMENT
  // ============================================================================
  
  /**
   * Creates a new player at spawn position
   * @returns {Object} Player object with position, velocity, and state
   */
  createPlayer() {
    // Use canvas dimensions if available, otherwise default
    const canvasWidth = typeof width !== 'undefined' ? width : 800;
    const canvasHeight = typeof height !== 'undefined' ? height : 600;
    
    return {
      x: canvasWidth / 2,
      y: canvasHeight / 2,
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
    const canvasWidth = typeof width !== 'undefined' ? width : 800;
    const canvasHeight = typeof height !== 'undefined' ? height : 600;
    
    this.player = {
      x: canvasWidth / 2,
      y: canvasHeight / 2,
      vx: 0,
      vy: 0,
      angle: 0,
      alive: true,
      respawnTime: 0,
      invulnerableUntil: Date.now() + ThrustGame.PLAYER.INVULNERABLE_TIME
    };
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
    
    // Announce to multiplayer if connected
    if (this.collaborationManager && this.collaborationManager.isConnected) {
      this.broadcastPlayerState();
    }
  }
  
  /**
   * Stops the game
   */
  stop() {
    this.active = false;
    this.bullets = [];
    this.remotePlayers.clear();
    this.remoteBullets.clear();
    
    // Clear keyboard state
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
    
    // Handle respawn timing
    if (!this.player.alive) {
      if (Date.now() >= this.player.respawnTime) {
        this.respawnPlayer();
      }
      return;
    }
    
    // Update player physics
    this.updatePlayerPhysics();
    
    // Update bullets
    this.updateBullets();
    
    // Check collisions
    this.checkCollisions();
    
    // Broadcast state to multiplayer
    if (this.collaborationManager && this.collaborationManager.isConnected) {
      // Throttle broadcasts (every ~100ms)
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
    
    // Update position
    p.x += p.vx;
    p.y += p.vy;
    
    // Wrap around screen edges
    const canvasWidth = typeof width !== 'undefined' ? width : 800;
    const canvasHeight = typeof height !== 'undefined' ? height : 600;
    
    if (p.x < 0) p.x = canvasWidth;
    if (p.x > canvasWidth) p.x = 0;
    if (p.y < 0) p.y = canvasHeight;
    if (p.y > canvasHeight) p.y = 0;
  }
  
  /**
   * Updates all bullets (movement and lifetime)
   */
  updateBullets() {
    const canvasWidth = typeof width !== 'undefined' ? width : 800;
    const canvasHeight = typeof height !== 'undefined' ? height : 600;
    
    // Update bullets in place and remove expired ones
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      
      bullet.x += bullet.vx;
      bullet.y += bullet.vy;
      bullet.lifetime--;
      
      // Wrap around screen
      if (bullet.x < 0) bullet.x = canvasWidth;
      if (bullet.x > canvasWidth) bullet.x = 0;
      if (bullet.y < 0) bullet.y = canvasHeight;
      if (bullet.y > canvasHeight) bullet.y = 0;
      
      // Remove expired bullets
      if (bullet.lifetime <= 0) {
        this.bullets.splice(i, 1);
      }
    }
  }
  
  /**
   * Checks for collisions between bullets and players
   */
  checkCollisions() {
    // Check local bullets against remote players
    for (const bullet of this.bullets) {
      for (const [clientId, remotePlayer] of this.remotePlayers) {
        if (!remotePlayer.alive) continue;
        
        const dx = bullet.x - remotePlayer.x;
        const dy = bullet.y - remotePlayer.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < ThrustGame.PLAYER.SIZE + ThrustGame.BULLET.SIZE) {
          // Hit! Remove bullet and notify of kill
          bullet.lifetime = 0;
          this.score++;
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
        
        if (dist < ThrustGame.PLAYER.SIZE + ThrustGame.BULLET.SIZE) {
          // Hit! Player dies
          this.player.alive = false;
          this.player.respawnTime = Date.now() + ThrustGame.PLAYER.RESPAWN_TIME;
          this.deaths++;
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
    
    // Arrow keys (use numeric codes for reliability)
    if (keyCode === 37) {  // Left
      this.keys.left = true;
    } else if (keyCode === 39) {  // Right
      this.keys.right = true;
    } else if (keyCode === 38) {  // Up
      this.keys.up = true;
    } else if (keyCode === 40) {  // Down
      this.keys.down = true;
    }
    
    // Spacebar for shooting
    if (keyCode === 32 || key === ' ') {
      this.fireBullet();
    }
  }
  
  /**
   * Handles key release events
   * @param {number} keyCode - The key code
   */
  handleKeyReleased(keyCode) {
    if (!this.active) return;
    
    if (keyCode === 37) {  // Left
      this.keys.left = false;
    } else if (keyCode === 39) {  // Right
      this.keys.right = false;
    } else if (keyCode === 38) {  // Up
      this.keys.up = false;
    } else if (keyCode === 40) {  // Down
      this.keys.down = false;
    }
  }
  
  /**
   * Fires a bullet from the player's ship
   */
  fireBullet() {
    if (!this.player.alive) return;
    
    const now = Date.now();
    if (now - this.lastFireTime < ThrustGame.BULLET.COOLDOWN * ThrustGame.TIMING.FRAME_TIME_MS) return;
    
    this.lastFireTime = now;
    
    // Create bullet at ship tip
    const tipDist = ThrustGame.PLAYER.SIZE;
    const bullet = {
      id: Utils.generateUUID(),
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
   * Draws the game (called from main draw loop)
   */
  draw() {
    if (!this.active) return;
    
    // Draw in screen space (not world space)
    push();
    resetMatrix();
    
    // Dark space background
    const bg = ThrustGame.COLORS.BACKGROUND;
    background(bg.r, bg.g, bg.b);
    
    // Draw remote players
    for (const [clientId, remotePlayer] of this.remotePlayers) {
      if (remotePlayer.alive) {
        this.drawPlayer(remotePlayer, ThrustGame.COLORS.PLAYER_REMOTE, false);
      }
    }
    
    // Draw local player
    if (this.player.alive) {
      const isInvulnerable = Date.now() < this.player.invulnerableUntil;
      this.drawPlayer(this.player, ThrustGame.COLORS.PLAYER_LOCAL, this.keys.up, isInvulnerable);
    }
    
    // Draw bullets
    this.drawBullets();
    
    // Draw UI
    this.drawUI();
    
    pop();
  }
  
  /**
   * Draws a player ship
   * @param {Object} player - Player object
   * @param {Object} color - Color object {r, g, b}
   * @param {boolean} showThrust - Whether to show thrust flame
   * @param {boolean} invulnerable - Whether player is invulnerable (flashing effect)
   */
  drawPlayer(player, color, showThrust = false, invulnerable = false) {
    push();
    translate(player.x, player.y);
    rotate(player.angle);
    
    // Flash effect for invulnerability
    if (invulnerable && Math.floor(millis() / 100) % 2 === 0) {
      pop();
      return;
    }
    
    // Draw ship as triangle
    noStroke();
    fill(color.r, color.g, color.b);
    triangle(
      ThrustGame.PLAYER.SIZE, 0,
      -ThrustGame.PLAYER.SIZE / 2, -ThrustGame.PLAYER.SIZE / 2,
      -ThrustGame.PLAYER.SIZE / 2, ThrustGame.PLAYER.SIZE / 2
    );
    
    // Draw thrust flame if thrusting
    if (showThrust) {
      const flame = ThrustGame.COLORS.THRUST_FLAME;
      fill(flame.r, flame.g, flame.b);
      const flameLength = 15 + Math.random() * 5;
      triangle(
        -ThrustGame.PLAYER.SIZE / 2, -5,
        -ThrustGame.PLAYER.SIZE / 2, 5,
        -ThrustGame.PLAYER.SIZE / 2 - flameLength, 0
      );
    }
    
    pop();
  }
  
  /**
   * Draws all bullets
   */
  drawBullets() {
    // Local bullets
    noStroke();
    const localColor = ThrustGame.COLORS.BULLET_LOCAL;
    fill(localColor.r, localColor.g, localColor.b);
    for (const bullet of this.bullets) {
      circle(bullet.x, bullet.y, ThrustGame.BULLET.SIZE * 2);
    }
    
    // Remote bullets
    const remoteColor = ThrustGame.COLORS.BULLET_REMOTE;
    fill(remoteColor.r, remoteColor.g, remoteColor.b);
    for (const [bulletId, bullet] of this.remoteBullets) {
      circle(bullet.x, bullet.y, ThrustGame.BULLET.SIZE * 2);
    }
  }
  
  /**
   * Draws UI elements (score, status, instructions)
   */
  drawUI() {
    fill(ThrustGame.COLORS.UI_TEXT);
    textAlign(LEFT, TOP);
    textSize(16);
    
    // Score and stats
    text(`Score: ${this.score}`, 10, 10);
    text(`Deaths: ${this.deaths}`, 10, 30);
    
    // Instructions
    textSize(12);
    textAlign(CENTER, TOP);
    const canvasWidth = typeof width !== 'undefined' ? width : 800;
    text('Arrow Keys: Move | Space: Fire | Shift+T: Exit', canvasWidth / 2, 10);
    
    // Respawn countdown
    if (!this.player.alive) {
      textSize(24);
      textAlign(CENTER, CENTER);
      const canvasHeight = typeof height !== 'undefined' ? height : 600;
      const timeLeft = Math.ceil((this.player.respawnTime - Date.now()) / 1000);
      if (timeLeft > 0) {
        text(`Respawning in ${timeLeft}...`, canvasWidth / 2, canvasHeight / 2);
      }
    }
    
    // Multiplayer info
    if (this.collaborationManager && this.collaborationManager.isConnected) {
      textSize(12);
      textAlign(RIGHT, TOP);
      const playerCount = this.remotePlayers.size + 1;
      text(`Players: ${playerCount}`, canvasWidth - 10, 10);
    }
  }
  
  // ============================================================================
  // MULTIPLAYER
  // ============================================================================
  
  /**
   * Sets up multiplayer synchronization
   */
  setupMultiplayer() {
    // This would integrate with CollaborationManager's awareness or custom protocol
    // For now, we'll use a simple approach with awareness updates
    // In a real implementation, you'd want a dedicated game state sync
    
    // Listen for remote player updates (would need custom implementation in CollaborationManager)
    // For this Easter egg, we'll keep it simple and not implement full multiplayer
    // But the structure is here for future expansion
  }
  
  /**
   * Broadcasts local player state to other players
   */
  broadcastPlayerState() {
    // In a full implementation, this would send player position/velocity/angle
    // through the collaboration manager's awareness or a custom channel
    // For now, this is a placeholder
  }
  
  /**
   * Broadcasts a fired bullet to other players
   * @param {Object} bullet - Bullet object
   */
  broadcastBullet(bullet) {
    // In a full implementation, this would send bullet data to other players
    // For now, this is a placeholder
  }
}

// Export for use in other modules (if using modules)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ThrustGame;
}
