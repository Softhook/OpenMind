/**
 * ThrustShip.js - Represents a player ship in the Thrust mini-game
 */

class ThrustShip {
  constructor(options = {}) {
    this.x = options.x || 0;
    this.y = options.y || 0;
    this.vx = options.vx || 0;
    this.vy = options.vy || 0;
    this.angle = options.angle || 0;
    this.alive = options.alive !== undefined ? options.alive : true;
    this.respawnTime = options.respawnTime || 0;
    this.invulnerableUntil = options.invulnerableUntil || 0;
    this.grounded = options.grounded || false;
    this.name = options.name || '';
    this.color = options.color || '#FFFFFF';
    this.thrusting = options.thrusting || false;

    // Interpolation targets for remote ships
    this.targetX = this.x;
    this.targetY = this.y;
    this.targetAngle = this.angle;
  }

  /**
   * Updates ship physics based on input and environment
   */
  updatePhysics(keys, mindMap) {
    if (!this.alive) return;

    const phys = ThrustConstants.PHYSICS;
    const prevX = this.x;
    const prevY = this.y;
    const prevAngle = this.angle;

    // Apply rotation
    if (keys.left) {
      this.angle -= phys.ROTATION_SPEED;
      this.grounded = false;
    }
    if (keys.right) {
      this.angle += phys.ROTATION_SPEED;
      this.grounded = false;
    }

    // Apply thrust
    this.thrusting = keys.up;
    if (this.thrusting) {
      this.vx += Math.cos(this.angle) * phys.THRUST;
      this.vy += Math.sin(this.angle) * phys.THRUST;
      this.grounded = false;
    }

    // Downward thrust (reverse)
    if (keys.down) {
      this.vx -= Math.cos(this.angle) * phys.THRUST * 0.5;
      this.vy -= Math.sin(this.angle) * phys.THRUST * 0.5;
      this.grounded = false;
    }

    // Apply gravity
    if (!this.grounded) {
      this.vy += phys.GRAVITY;
    }

    // Apply drag
    this.vx *= phys.DRAG;
    this.vy *= phys.DRAG;

    // Limit speed
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed > phys.MAX_SPEED) {
      const scale = phys.MAX_SPEED / speed;
      this.vx *= scale;
      this.vy *= scale;
    }

    // Update position
    this.x += this.vx;
    this.y += this.vy;

    // Collision detection
    this.handleCollisions(mindMap, prevX, prevY, prevAngle, keys);
  }

  /**
   * Handles boat collisions with mind map boxes
   */
  handleCollisions(mindMap, prevX, prevY, prevAngle, keys) {
    if (!mindMap || !mindMap.boxes) return;

    const shipVertices = ThrustUtils.getShipTriangleVertices(this, ThrustConstants.PLAYER.SIZE);
    let collisionDetected = false;

    for (const box of mindMap.boxes) {
      if (!box) continue;

      if (ThrustUtils.triangleBoxCollision(shipVertices, box)) {
        collisionDetected = true;
        const velocityMagnitude = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        const phys = ThrustConstants.PHYSICS;
        
        const separation = this.resolveTriangleBoxCollision(box);
        if (separation) {
          const isBeingPushedUp = separation.y < 0;
          this.x += separation.x;
          this.y += separation.y;

          if (velocityMagnitude < phys.GROUNDING_VELOCITY && isBeingPushedUp && this.vy >= 0 && !keys.up) {
            this.vx = 0;
            this.vy = 0;
            this.grounded = true;
          } else {
            if (velocityMagnitude > 1.0) {
              this.vx *= -phys.BOUNCE_AMOUNT;
              this.vy *= -phys.BOUNCE_AMOUNT;
            } else {
              this.vx = 0;
              this.vy = 0;
            }
            this.grounded = false;
          }
        } else {
          this.x = prevX;
          this.y = prevY;
          this.vx *= -phys.BOUNCE_AMOUNT;
          this.vy *= -phys.BOUNCE_AMOUNT;
          this.grounded = false;
        }
        break; 
      }
    }

    if (!collisionDetected && this.grounded) {
      const nudgedPlayer = { x: this.x, y: this.y + ThrustConstants.PHYSICS.GROUNDING_NUDGE, angle: this.angle };
      const nudgedVertices = ThrustUtils.getShipTriangleVertices(nudgedPlayer, ThrustConstants.PLAYER.SIZE);
      let hasSurfaceBelow = false;
      for (const box of mindMap.boxes) {
        if (box && ThrustUtils.triangleBoxCollision(nudgedVertices, box)) {
          hasSurfaceBelow = true;
          break;
        }
      }
      if (!hasSurfaceBelow) this.grounded = false;
    }
  }

  /**
   * Resolves a triangle-box collision
   */
  resolveTriangleBoxCollision(box) {
    const magnitudes = [1, 2, 5, 10, 20];
    const directions = [
      { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 },
      { x: -0.707, y: -0.707 }, { x: 0.707, y: -0.707 },
      { x: -0.707, y: 0.707 }, { x: 0.707, y: 0.707 }
    ];

    for (const mag of magnitudes) {
      for (const dir of directions) {
        const testPos = {
          x: this.x + dir.x * mag,
          y: this.y + dir.y * mag,
          angle: this.angle
        };

        const testVertices = ThrustUtils.getShipTriangleVertices(testPos, ThrustConstants.PLAYER.SIZE);
        if (!ThrustUtils.triangleBoxCollision(testVertices, box)) {
          return { x: dir.x * mag, y: dir.y * mag };
        }
      }
    }

    const dx = this.x - box.x;
    const dy = this.y - box.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0) {
      const dirX = dx / dist, dirY = dy / dist;
      const escapeMag = 30;
      const testPos = { x: this.x + dirX * escapeMag, y: this.y + dirY * escapeMag, angle: this.angle };
      if (!ThrustUtils.triangleBoxCollision(ThrustUtils.getShipTriangleVertices(testPos, ThrustConstants.PLAYER.SIZE), box)) {
        return { x: dirX * escapeMag, y: dirY * escapeMag };
      }
    }

    return null;
  }

  /**
   * Interpolates the ship's position and angle towards targets
   */
  interpolate(factor) {
    if (!this.alive) return;

    this.x += (this.targetX - this.x) * factor;
    this.y += (this.targetY - this.y) * factor;

    let angleDiff = this.targetAngle - this.angle;
    const TWO_PI = Math.PI * 2;
    angleDiff = ((angleDiff + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
    this.angle += angleDiff * factor;
    this.angle = (this.angle % TWO_PI + TWO_PI) % TWO_PI;
  }

  /**
   * Draws the ship
   */
  draw(isInvulnerable) {
    if (!this.alive) return;

    push();
    translate(this.x, this.y);

    if (this.name) {
      push();
      fill(0);
      noStroke();
      textAlign(CENTER, BOTTOM);
      textSize(12);
      text(this.name, 0, -ThrustConstants.PLAYER.SIZE - 5);
      pop();
    }

    push();
    rotate(this.angle);

    if (isInvulnerable) {
      const time = typeof millis !== 'undefined' ? millis() : Date.now();
      if (Math.floor(time / 100) % 2 === 0) {
        pop();
        pop();
        return;
      }
    }

    let r = 255, g = 255, b = 255;
    if (typeof this.color === 'string') {
      const hex = this.color.replace('#', '');
      if (hex.length === 6 && /^[0-9A-Fa-f]{6}$/.test(hex)) {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
      } else {
        const fb = ThrustConstants.COLORS.PLAYER_REMOTE;
        r = fb.r; g = fb.g; b = fb.b;
      }
    } else if (this.color && typeof this.color === 'object') {
      r = Number.isFinite(this.color.r) ? this.color.r : 255;
      g = Number.isFinite(this.color.g) ? this.color.g : 255;
      b = Number.isFinite(this.color.b) ? this.color.b : 255;
    }

    const half = ThrustConstants.PLAYER.SIZE / 2;
    noStroke();
    fill(r, g, b);
    triangle(ThrustConstants.PLAYER.SIZE, 0, -half, -half, -half, half);

    if (this.thrusting) {
      const f = ThrustConstants.COLORS.THRUST_FLAME;
      fill(f.r, f.g, f.b);
      triangle(-half, -5, -half, 5, -half - (ThrustConstants.PLAYER.FLAME_BASE_LENGTH + Math.random() * 10), 0);
    }

    pop();
    pop();
  }
}

// Export for module use if available
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ThrustShip;
} else {
  // Otherwise attach to window for global access
  window.ThrustShip = ThrustShip;
}
