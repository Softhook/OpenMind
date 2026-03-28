/**
 * ThrustExplosion.js - Manages explosion particle systems for the Thrust mini-game
 */

class ThrustExplosion {
  constructor(options = {}) {
    this.x = options.x || 0;
    this.y = options.y || 0;
    this.type = options.type || 'player';
    this.startTime = Date.now();
    this.duration = ThrustConstants.EXPLOSION.DURATION;
    this.color = options.color || null;
    this.scale = options.scale || 1.0;
    this.particles = [];
    this.sparks = [];

    this.init();
  }

  /**
   * Initializes the explosion's particles and sparks
   */
  init() {
    const baseCount = this.type === 'box' ? ThrustConstants.EXPLOSION.SHRAPNEL_COUNT : 20;
    const baseSparkCount = this.type === 'box' ? ThrustConstants.EXPLOSION.SPARK_COUNT : 15;
    const count = Math.min(100, Math.floor(baseCount * this.scale));
    const sparkCount = Math.min(80, Math.floor(baseSparkCount * this.scale));

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const baseSpeed = ThrustConstants.EXPLOSION.SHRAPNEL_SPEED_MIN + 
                       Math.random() * (ThrustConstants.EXPLOSION.SHRAPNEL_SPEED_MAX - ThrustConstants.EXPLOSION.SHRAPNEL_SPEED_MIN);
      const speed = baseSpeed * (0.8 + 0.4 * this.scale);
      
      this.particles.push({
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: (6 + Math.random() * 14) * Math.sqrt(this.scale),
        h: (6 + Math.random() * 14) * Math.sqrt(this.scale),
        angle: Math.random() * Math.PI * 2,
        va: (Math.random() - 0.5) * 0.4,
        color: this.color || (this.type === 'box' ? { r: 200, g: 200, b: 200 } : { r: 255, g: 100, b: 50 }),
        sizeScale: 0.8 + Math.random() * 0.4
      });
    }

    for (let i = 0; i < sparkCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const baseSparkSpeed = ThrustConstants.EXPLOSION.SPARK_SPEED_MIN + 
                    Math.random() * (ThrustConstants.EXPLOSION.SPARK_SPEED_MAX - ThrustConstants.EXPLOSION.SPARK_SPEED_MIN);
      const sparkSpeed = baseSparkSpeed * (0.9 + 0.2 * this.scale);
      
      this.sparks.push({
        vx: Math.cos(angle) * sparkSpeed,
        vy: Math.sin(angle) * sparkSpeed,
        length: (8 + Math.random() * 20) * this.scale,
        color: { r: 255, g: 255, b: 180 + Math.random() * 75 }
      });
    }
  }

  /**
   * Updates the explosion state
   */
  isExpired() {
    return Date.now() - this.startTime >= this.duration;
  }

  /**
   * Draws the explosion particles
   */
  draw() {
    const elapsed = Date.now() - this.startTime;
    const progress = elapsed / this.duration;
    if (progress >= 1) return;

    let alpha = 255 * (1 - Math.pow((progress - ThrustConstants.EXPLOSION.FADE_START) / (1 - ThrustConstants.EXPLOSION.FADE_START), 2));
    if (progress < ThrustConstants.EXPLOSION.FADE_START) alpha = 255;

    push();
    translate(this.x, this.y);

    // Shockwave layer
    if (this.type === 'box') {
      const baseRadius = ThrustConstants.EXPLOSION.MAX_RADIUS * this.scale;
      const shockSize = baseRadius * (1 - Math.pow(1 - progress, 3));
      noFill();
      stroke(255, 255, 255, alpha * 0.4);
      strokeWeight(4 * (1 - progress));
      circle(0, 0, shockSize * 1.5);
      stroke(255, 200, 100, alpha * 0.2);
      circle(0, 0, shockSize * 2.2);
    }

    // Spark layer
    strokeCap(ROUND);
    for (const s of this.sparks) {
      const sx = s.vx * (elapsed / 16);
      const sy = s.vy * (elapsed / 16);
      push();
      translate(sx, sy);
      rotate(Math.atan2(s.vy, s.vx));
      stroke(s.color.r, s.color.g, s.color.b, alpha);
      strokeWeight(2);
      line(0, 0, s.length * (1 - progress), 0);
      pop();
    }

    // Particle/Shrapnel layer
    rectMode(CENTER);
    for (const p of this.particles) {
      const px = p.vx * (elapsed / 16);
      const py = p.vy * (elapsed / 16);
      const pAngle = p.angle + p.va * (elapsed / 16);
      const pScale = p.sizeScale * (1 - progress * 0.5);

      push();
      translate(px, py);
      rotate(pAngle);
      stroke(0, alpha);
      strokeWeight(1);
      fill(p.color.r, p.color.g, p.color.b, alpha);
      rect(0, 0, p.w * pScale, p.h * pScale);
      if (progress < 0.4) {
        noStroke();
        fill(255, 255, 255, alpha * 0.3);
        rect(0, 0, p.w * pScale * 0.5, p.h * pScale * 0.5);
      }
      pop();
    }

    // Central flash layer
    if (progress < 0.2) {
      const baseRadius = ThrustConstants.EXPLOSION.MAX_RADIUS * this.scale;
      const flashRadius = baseRadius * (1 - progress * 5);
      noStroke();
      fill(255, 255, 255, 255);
      circle(0, 0, flashRadius * 0.8);
      fill(255, 255, 150, 180);
      circle(0, 0, flashRadius * 1.5);
    }

    pop();
  }
}

// Export for module use if available
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ThrustExplosion;
} else {
  // Otherwise attach to window for global access
  window.ThrustExplosion = ThrustExplosion;
}
