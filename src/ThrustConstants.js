/**
 * ThrustConstants.js - Configuration for the Thrust mini-game.
 *
 * All tunable values live here. No game logic or specialization belongs here.
 * Audio volumes are normalised to the range [0, 1] and should be perceptually
 * balanced — test at comfortable listening levels before adjusting.
 */

const ThrustConstants = {
  PHYSICS: {
    GRAVITY: 0.03,
    THRUST: 0.2,
    ROTATION_SPEED: 0.08,
    MAX_SPEED: 8,
    DRAG: 0.98,
    GROUNDING_VELOCITY: 1.0,
    GROUNDING_NUDGE: 1.2,
    COLLISION_DAMPING: 0.4,
    BOUNCE_AMOUNT: 0.5
  },

  PLAYER: {
    SIZE: 15,
    RESPAWN_TIME: 3000,
    INVULNERABLE_TIME: 2000,
    FLAME_BASE_LENGTH: 15,
    FLAME_VARIATION: 12
  },

  EXPLOSION: {
    DURATION: 1200,
    MAX_RADIUS: 120,
    FADE_START: 0.2,
    SHRAPNEL_COUNT: 40,
    SHRAPNEL_SPEED_MIN: 4,
    SHRAPNEL_SPEED_MAX: 14,
    SPARK_COUNT: 25,
    SPARK_SPEED_MIN: 8,
    SPARK_SPEED_MAX: 20
  },

  HEALTH: {
    RECOVERY_DELAY: 10000,
    RECOVERY_RATE: 10000
  },

  BULLET: {
    SPEED: 12,
    LIFETIME: 120,
    SIZE: 4,
    COOLDOWN: 15,
    BOX_PUSH_FORCE: 6
  },

  COLLISION: {
    RADIUS: 15 + 4,
    EPSILON: 0.0001,
    VELOCITY_EPSILON: 0.001,
    PUSH_OUT_DISTANCE: 2,
    PUSH_OUT_DIAGONAL: Math.SQRT2
  },

  TIMING: {
    FRAME_TIME_MS: 1000 / 60
  },

  KEY_CODES: {
    LEFT: 37,
    RIGHT: 39,
    UP: 38,
    DOWN: 40,
    SPACE: 32
  },

  KEY_MAP: [
    { name: 'left', code: 37 },
    { name: 'right', code: 39 },
    { name: 'up', code: 38 },
    { name: 'down', code: 40 }
  ],

  COLORS: {
    BACKGROUND: { r: 10, g: 10, b: 30 },
    PLAYER_LOCAL: { r: 100, g: 200, b: 255 },
    PLAYER_REMOTE: { r: 255, g: 100, b: 100 },
    BULLET_LOCAL: { r: 0, g: 0, b: 0 },
    BULLET_REMOTE: { r: 255, g: 0, b: 0 },
    THRUST_FLAME: { r: 255, g: 150, b: 50 },
    UI_TEXT: 255
  },

  DEFAULT_PLAYER_NAME: 'Player',
  DEFAULT_PLAYER_COLOR: '#FF6464',

  SPAWN: {
    MAX_ATTEMPTS: 50,
    SEARCH_RADIUS: 150,
    MIN_DISTANCE_FROM_BOX: 40
  },

  AUDIO: {
    /** Set to false to silence all Thrust audio. */
    ENABLED: true,

    // ── Per-sound volumes [0–1] ─────────────────────────────────────────────
    /** Explosion (player death / box destruction). Scale is applied on top. */
    EXPLOSION_VOLUME: 0.65,
    /** Bullet-hits-box impact click. */
    IMPACT_VOLUME:    0.35,
    /** Continuous engine rumble while thrusting. */
    THRUST_VOLUME:    0.28,
    /** Fire/shoot sound per bullet. */
    FIRE_VOLUME:      0.20,
    /** Gentle thud when the ship touches down. */
    LANDING_VOLUME:   0.22,
    /** Sharp crack when the ship bounces off a box. */
    BOUNCE_VOLUME:    0.25
  }
};

// Export for module use if available
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ThrustConstants;
} else {
  // Otherwise attach to window for global access
  window.ThrustConstants = ThrustConstants;
}
