/**
 * ThrustBullet.js - Represents a bullet in the Thrust mini-game
 */

class ThrustBullet {
  constructor(options = {}) {
    this.id = options.id || `bullet_${Date.now()}_${Math.random()}`;
    this.x = options.x || 0;
    this.y = options.y || 0;
    this.vx = options.vx || 0;
    this.vy = options.vy || 0;
    this.lifetime = options.lifetime || ThrustConstants.BULLET.LIFETIME;
    this.clientId = options.clientId || null;
    this.scored = false;

    // Interpolation targets for remote bullets
    this.targetX = this.x;
    this.targetY = this.y;
  }

  /**
   * Updates bullet physics
   */
  update() {
    this.lifetime--;

    if (this.clientId) {
      // Remote bullet: advance the prediction target then lerp towards it.
      // Do NOT also apply velocity directly — that would move the bullet twice.
      const lerpFactor = 0.2;
      this.targetX += this.vx;
      this.targetY += this.vy;
      this.x += (this.targetX - this.x) * lerpFactor;
      this.y += (this.targetY - this.y) * lerpFactor;
    } else {
      // Local bullet: direct velocity integration.
      this.x += this.vx;
      this.y += this.vy;
    }
  }

  /**
   * Checks for collision with a box
   */
  checkCollision(mindMap) {
    if (!mindMap || !mindMap.boxes) return null;

    const radius = ThrustConstants.BULLET.SIZE;

    for (const box of mindMap.boxes) {
      if (!box) continue;

      const halfW = box.width / 2;
      const halfH = box.height / 2;
      const boxLeft = box.x - halfW;
      const boxRight = box.x + halfW;
      const boxTop = box.y - halfH;
      const boxBottom = box.y + halfH;

      const closestX = Math.max(boxLeft, Math.min(this.x, boxRight));
      const closestY = Math.max(boxTop, Math.min(this.y, boxBottom));

      const distX = this.x - closestX;
      const distY = this.y - closestY;
      const distSq = distX * distX + distY * distY;

      if (distSq < radius * radius) {
        return box;
      }
    }

    return null;
  }

  /**
   * Checks if bullet hits a target with trajectory detection
   */
  checkHit(targetX, targetY) {
    const radius = ThrustConstants.COLLISION.RADIUS;
    const dx = this.x - targetX;
    const dy = this.y - targetY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < radius) return true;

    if (this.vx || this.vy) {
      const prevX = this.x - this.vx;
      const prevY = this.y - this.vy;
      const closestPoint = ThrustUtils.getClosestPointOnLineSegment(prevX, prevY, this.x, this.y, targetX, targetY);
      const cDx = closestPoint.x - targetX;
      const cDy = closestPoint.y - targetY;
      return Math.sqrt(cDx * cDx + cDy * cDy) < radius;
    }

    return false;
  }

  /**
   * Draws the bullet
   */
  draw(isActive) {
    const color = isActive ? ThrustConstants.COLORS.BULLET_LOCAL : ThrustConstants.COLORS.BULLET_REMOTE;
    fill(color.r, color.g, color.b);
    noStroke();
    circle(this.x, this.y, ThrustConstants.BULLET.SIZE * 2);
  }
}

// Export for module use if available
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ThrustBullet;
} else {
  // Otherwise attach to window for global access
  window.ThrustBullet = ThrustBullet;
}
