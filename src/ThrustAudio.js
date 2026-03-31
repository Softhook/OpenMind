/**
 * ThrustAudio.js — Procedural audio synthesis for the Thrust mini-game.
 *
 * Design principles
 * -----------------
 *  • Zero external assets — all sounds are synthesised via the Web Audio API.
 *  • Flat volume — all sounds play at constant volume; no spatial attenuation.
 *  • Single AudioContext shared across all sounds; created lazily on first use.
 *  • All public methods are safe to call without guards — they fail silently if
 *    audio is unavailable or disabled.
 *  • Every allocated AudioNode is disconnected on completion to prevent leaks.
 *  • Voice limiting prevents node accumulation during rapid or burst events.
 */

class ThrustAudio {
  // ── Static state ──────────────────────────────────────────────────────────

  static _context      = null;
  static _noiseBuffer  = null;
  static _initPromise  = null;

  // Persistent nodes for the continuous thrust tone.
  static _thrustSource = null;
  static _thrustGain   = null;
  static _thrustFilter = null;

  // Per-sound debounce timestamps (AudioContext currentTime units).
  static _lastFireTime   = 0;
  static _lastLandTime   = 0;
  static _lastBounceTime = 0;

  // Voice limiter — tracks active concurrent one-shot nodes.
  static _activeVoices = 0;
  static _MAX_VOICES   = 12;

  // ── Config ────────────────────────────────────────────────────────────────

  /**
   * Returns the AUDIO config block from ThrustConstants, or a safe fallback
   * so every caller can dereference without null-checks.
   * @returns {object}
   */
  static _cfg() {
    if (typeof ThrustConstants !== 'undefined' && ThrustConstants.AUDIO) {
      return ThrustConstants.AUDIO;
    }
    // Fallback — keep in sync with ThrustConstants.AUDIO manually.
    return {
      ENABLED:          true,
      EXPLOSION_VOLUME: 0.65,
      IMPACT_VOLUME:    0.35,
      THRUST_VOLUME:    0.28,
      FIRE_VOLUME:      0.20,
      LANDING_VOLUME:   0.22,
      BOUNCE_VOLUME:    0.25
    };
  }

  static _isEnabled() { return this._cfg().ENABLED !== false; }

  // ── Initialisation ────────────────────────────────────────────────────────

  /**
   * Lazily creates the AudioContext and pre-fills the shared noise buffer.
   * Safe to call multiple times — returns the same promise until cleanup().
   * @returns {Promise<AudioContext|null>}
   */
  static init() {
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      try {
        if (this._context?.state === 'closed') this._context = null;

        if (this._context) {
          if (this._context.state === 'suspended') {
            await this._context.resume().catch(() => {});
          }
          return this._context;
        }

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;

        this._context = new AudioCtx();

        // 1 second of white noise — sufficient for every sound in this engine.
        const sr = this._context.sampleRate;
        this._noiseBuffer = this._context.createBuffer(1, sr, sr);
        const data = this._noiseBuffer.getChannelData(0);
        for (let i = 0; i < sr; i++) data[i] = Math.random() * 2 - 1;

        return this._context;
      } catch (e) {
        console.warn('ThrustAudio: init failed —', e);
        this._initPromise = null;
        return null;
      }
    })();

    return this._initPromise;
  }

  /**
   * Resolves a ready-to-use AudioContext, resuming it if suspended.
   * Returns null when audio is disabled or the API is unavailable.
   * @returns {Promise<AudioContext|null>}
   */
  static async _getCtx() {
    if (!this._isEnabled()) return null;
    const ctx = await this.init();
    if (!ctx || !this._noiseBuffer) return null;
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    return ctx.state === 'running' ? ctx : null;
  }

  // ── Node helpers ──────────────────────────────────────────────────────────

  /** @returns {AudioBufferSourceNode} A one-shot or looping white-noise source. */
  static _noiseSource(ctx, loop = false) {
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    src.loop = loop;
    return src;
  }

  /**
   * Registers an onended handler that disconnects all supplied nodes and
   * decrements the voice counter.
   * Include the source node itself in `nodes` to fully clean up the graph.
   */
  static _autoDisconnect(source, nodes) {
    source.onended = () => {
      this._activeVoices = Math.max(0, this._activeVoices - 1);
      for (const n of nodes) { try { n.disconnect(); } catch (_) {} }
    };
  }

  /**
   * Plays a filtered white-noise burst.
   *
   * freqEnd must be > 0 (Web Audio API requirement for exponential ramps).
   * When freqEnd equals freqStart no ramp is scheduled — just a constant value.
   *
   * @param {AudioContext} ctx
   * @param {number}       t    AudioContext timestamp to schedule from.
   * @param {{
   *   filterType: BiquadFilterType,
   *   freqStart:  number,
   *   freqEnd:    number,
   *   Q?:         number,   // default 1
   *   vol:        number,
   *   duration:   number
   * }} opts
   */
  static _playNoise(ctx, t, { filterType, freqStart, freqEnd, Q = 1, vol, duration }) {
    const src    = this._noiseSource(ctx);
    const filter = ctx.createBiquadFilter();
    const gain   = ctx.createGain();

    filter.type = filterType;
    filter.frequency.setValueAtTime(freqStart, t);
    // Only ramp when frequencies differ — exponentialRamp requires a positive target.
    if (freqEnd !== freqStart && freqEnd > 0) {
      filter.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
    }
    if (Q !== 1) filter.Q.value = Q;

    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    this._autoDisconnect(src, [src, filter, gain]);

    src.start(t);
    src.stop(t + duration);
    this._activeVoices++;
  }

  /**
   * Plays a frequency-swept oscillator tone.
   *
   * @param {AudioContext} ctx
   * @param {number}       t    AudioContext timestamp to schedule from.
   * @param {{
   *   type:      OscillatorType,
   *   freqStart: number,
   *   freqEnd:   number,
   *   vol:       number,
   *   duration:  number
   * }} opts
   */
  static _playOsc(ctx, t, { type, freqStart, freqEnd, vol, duration }) {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    if (freqEnd !== freqStart && freqEnd > 0) {
      osc.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
    }

    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    this._autoDisconnect(osc, [osc, gain]);

    osc.start(t);
    osc.stop(t + duration);
    this._activeVoices++;
  }

  // ── Public sound API ──────────────────────────────────────────────────────

  /**
   * Explosion sound — noise crack + sub-bass thump.
   * Scale 1.0 = typical player death.  0.5–0.9 = small box; up to 2.0 = large.
   * @param {number} scale  [0.4–2.0]
   */
  static async playExplosion(scale = 1.0) {
    const ctx = await this._getCtx();
    if (!ctx) return;
    // Explosion uses 2 voices; leave headroom for other sounds.
    if (this._activeVoices >= this._MAX_VOICES - 1) return;

    const s        = Math.max(0.4, Math.min(2.0, scale));
    const duration = 0.5 * s;
    const vol      = this._cfg().EXPLOSION_VOLUME * Math.min(1.2, s);
    const t        = ctx.currentTime; // Single timestamp for both layers

    try {
      this._playNoise(ctx, t, {
        filterType: 'lowpass', freqStart: 1200, freqEnd: 20, vol, duration
      });
      this._playOsc(ctx, t, {
        type: 'sine', freqStart: 160, freqEnd: 30,
        vol: vol * 0.85, duration: duration * 0.8
      });
    } catch (e) {
      console.warn('ThrustAudio: playExplosion failed —', e);
    }
  }

  /** Impact click when a bullet damages a box (but does not destroy it). */
  static async playImpact() {
    const ctx = await this._getCtx();
    if (!ctx) return;
    if (this._activeVoices >= this._MAX_VOICES) return;

    try {
      this._playNoise(ctx, ctx.currentTime, {
        filterType: 'bandpass', freqStart: 3000, freqEnd: 3000,
        Q: 8, vol: this._cfg().IMPACT_VOLUME, duration: 0.06
      });
    } catch (e) {
      console.warn('ThrustAudio: playImpact failed —', e);
    }
  }

  /**
   * Starts (active=true) or stops (active=false) the continuous engine rumble.
   * Starting while already active is a no-op; stopping fades over ~120 ms.
   * @param {boolean} active
   */
  static async setThrust(active) {
    if (!this._isEnabled()) {
      if (this._thrustSource) this._stopThrustImmediate();
      return;
    }

    if (!active) {
      // Stop path: use whichever context we have, even if init is pending.
      // _stopThrustFade guards against a null context internally.
      this._stopThrustFade(this._context);
      return;
    }

    // Fast path: skip async init when the context is already ready.
    let ctx = this._context;
    if (!ctx || ctx.state === 'closed' || !this._noiseBuffer) {
      ctx = await this.init();
    }
    if (!ctx || !this._noiseBuffer) return;

    if (this._thrustSource) return; // Already running (may have started during await)

    try {
      const src    = this._noiseSource(ctx, /* loop */ true);
      const filter = ctx.createBiquadFilter();
      const gain   = ctx.createGain();

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, ctx.currentTime);

      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(this._cfg().THRUST_VOLUME, ctx.currentTime + 0.12);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      this._thrustSource = src;
      this._thrustFilter = filter;
      this._thrustGain   = gain;

      src.start();
    } catch (e) {
      console.warn('ThrustAudio: setThrust(true) failed —', e);
    }
  }

  /** Kills the thrust nodes instantly. Safe to call when nodes are null. */
  static _stopThrustImmediate() {
    const src    = this._thrustSource;
    const filter = this._thrustFilter;
    const gain   = this._thrustGain;

    this._thrustSource = null;
    this._thrustFilter = null;
    this._thrustGain   = null;

    try { src?.stop(); src?.disconnect(); } catch (_) {}
    try { filter?.disconnect(); } catch (_) {}
    try { gain?.disconnect(); } catch (_) {}
  }

  /**
   * Fades the thrust tone out then disconnects. Re-entrant safe.
   * ctx may be null (e.g. called before context was ever created) — guarded.
   */
  static _stopThrustFade(ctx) {
    const src    = this._thrustSource;
    const filter = this._thrustFilter;
    const gain   = this._thrustGain;

    if (!src && !gain) return; // Nothing running

    // Clear state before any async work so concurrent calls don't double-stop.
    this._thrustSource = null;
    this._thrustFilter = null;
    this._thrustGain   = null;

    try {
      if (gain && ctx && ctx.state === 'running') {
        const cur = gain.gain.value;
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setValueAtTime(cur, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.12);
        try { src?.stop(ctx.currentTime + 0.15); } catch (_) {}
      } else {
        // Context unavailable or closed — kill immediately.
        try { src?.stop(); } catch (_) {}
      }
    } catch (_) {}

    setTimeout(() => {
      try { src?.disconnect(); } catch (_) {}
      try { filter?.disconnect(); } catch (_) {}
      try { gain?.disconnect(); } catch (_) {}
    }, 180);
  }

  /**
   * "Pew" fire sound — noise crack + descending tone.
   * Rate-limited to ~20 shots/sec to prevent voice overload.
   */
  static async playFire() {
    const ctx = await this._getCtx();
    if (!ctx) return;

    if (ctx.currentTime - this._lastFireTime < 0.05) return;
    this._lastFireTime = ctx.currentTime;

    if (this._activeVoices >= this._MAX_VOICES - 1) return;

    const vol = this._cfg().FIRE_VOLUME;
    const t   = ctx.currentTime;

    try {
      this._playNoise(ctx, t, {
        filterType: 'bandpass', freqStart: 1400, freqEnd: 500,
        Q: 4, vol, duration: 0.1
      });
      this._playOsc(ctx, t, {
        type: 'triangle', freqStart: 2000, freqEnd: 200,
        vol: vol * 0.9, duration: 0.12
      });
    } catch (e) {
      console.warn('ThrustAudio: playFire failed —', e);
    }
  }

  /**
   * Low thud on touchdown.
   * Debounced to once per 500 ms to absorb landing jitter.
   */
  static async playLanding() {
    const ctx = await this._getCtx();
    if (!ctx) return;

    if (ctx.currentTime - this._lastLandTime < 0.5) return;
    this._lastLandTime = ctx.currentTime;

    if (this._activeVoices >= this._MAX_VOICES) return;

    try {
      this._playNoise(ctx, ctx.currentTime, {
        filterType: 'lowpass', freqStart: 600, freqEnd: 80,
        vol: this._cfg().LANDING_VOLUME, duration: 0.18
      });
    } catch (e) {
      console.warn('ThrustAudio: playLanding failed —', e);
    }
  }

  /**
   * Sharp crack on box bounce.
   * Debounced to once per 150 ms to prevent spam on rapid collisions.
   */
  static async playBounce() {
    const ctx = await this._getCtx();
    if (!ctx) return;

    if (ctx.currentTime - this._lastBounceTime < 0.15) return;
    this._lastBounceTime = ctx.currentTime;

    if (this._activeVoices >= this._MAX_VOICES) return;

    try {
      this._playNoise(ctx, ctx.currentTime, {
        filterType: 'bandpass', freqStart: 1800, freqEnd: 500,
        Q: 4, vol: this._cfg().BOUNCE_VOLUME, duration: 0.12
      });
    } catch (e) {
      console.warn('ThrustAudio: playBounce failed —', e);
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Stops all audio and releases the AudioContext.
   * Call when the game session ends.
   */
  static cleanup() {
    this._stopThrustImmediate();

    try { this._context?.close().catch(() => {}); } catch (_) {}

    this._context        = null;
    this._noiseBuffer    = null;
    this._initPromise    = null;
    this._activeVoices   = 0;
    this._lastFireTime   = 0;
    this._lastLandTime   = 0;
    this._lastBounceTime = 0;
  }
}

// Export for module use if available
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ThrustAudio;
} else {
  window.ThrustAudio = ThrustAudio;
}
