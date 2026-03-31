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
 *  • Slight random pitch variance per-event prevents mechanical repetition.
 */

class ThrustAudio {
  // ── Static state ──────────────────────────────────────────────────────────

  static _context      = null;
  static _noiseBuffer  = null;
  static _initPromise  = null;

  // Persistent nodes for the continuous thrust tone.
  static _thrustSource = null;
  static _thrustFilter = null;
  static _thrustGain   = null;
  static _thrustOsc    = null;   // Sawtooth oscillator — adds engine richness
  static _thrustOscGain = null;

  // Per-sound debounce timestamps (AudioContext currentTime units).
  static _lastFireTime   = 0;
  static _lastLandTime   = 0;
  static _lastBounceTime = 0;

  // Voice limiter — tracks active concurrent one-shot nodes.
  static _activeVoices = 0;
  static _MAX_VOICES   = 16;

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
   */
  static _autoDisconnect(source, nodes) {
    source.onended = () => {
      this._activeVoices = Math.max(0, this._activeVoices - 1);
      for (const n of nodes) { try { n.disconnect(); } catch (_) {} }
    };
  }

  /**
   * Plays a filtered white-noise burst.
   * freqEnd must differ from freqStart and be > 0 to trigger an exponential ramp.
   *
   * @param {AudioContext} ctx
   * @param {number}       t    AudioContext timestamp to schedule from.
   * @param {{
   *   filterType: BiquadFilterType,
   *   freqStart:  number,
   *   freqEnd:    number,
   *   Q?:         number,
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
   * freqEnd must differ from freqStart and be > 0 to trigger an exponential ramp.
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
   * Explosion — three frequency bands for a full-spectrum boom.
   *
   *  Layer 1: Initial crack   — brief highpass noise burst (air/spark)
   *  Layer 2: Main body       — bandpass noise sweeping low (the boom)
   *  Layer 3: Sub punch       — sine sweep, kept in audible range (80–35 Hz)
   *
   * Scale 1.0 = player death; 0.5–0.8 = small box; up to 2.0 = large.
   * @param {number} scale  [0.4–2.0]
   */
  static async playExplosion(scale = 1.0) {
    const ctx = await this._getCtx();
    if (!ctx) return;
    if (this._activeVoices >= this._MAX_VOICES - 2) return; // needs 3 slots

    const s        = Math.max(0.4, Math.min(2.0, scale));
    const duration = 0.6 * s;
    const vol      = this._cfg().EXPLOSION_VOLUME * Math.min(1.2, s);
    const t        = ctx.currentTime;

    try {
      // Layer 1: Initial crack — short, bright, punchy attack
      this._playNoise(ctx, t, {
        filterType: 'highpass', freqStart: 3500, freqEnd: 3500,
        Q: 0.5, vol: vol * 0.85, duration: 0.04
      });
      // Layer 2: Main body — wide bandpass sweeping from mid to low
      this._playNoise(ctx, t, {
        filterType: 'bandpass', freqStart: 700, freqEnd: 60,
        Q: 0.6, vol, duration
      });
      // Layer 3: Sub punch — sine sweep kept in the audible range (not subsonic)
      this._playOsc(ctx, t, {
        type: 'sine', freqStart: 120, freqEnd: 35,
        vol: vol * 0.9, duration: duration * 0.65
      });
    } catch (e) {
      console.warn('ThrustAudio: playExplosion failed —', e);
    }
  }

  /**
   * Impact — metallic ricochet when a bullet damages but doesn't destroy a box.
   *
   *  Layer 1: Tick   — very brief highpass noise (the "clink")
   *  Layer 2: Zing   — descending sine (metallic resonance)
   *
   * Slight random pitch variance prevents repetitive mechanical feel.
   */
  static async playImpact() {
    const ctx = await this._getCtx();
    if (!ctx) return;
    if (this._activeVoices >= this._MAX_VOICES - 1) return; // needs 2 slots

    const vol  = this._cfg().IMPACT_VOLUME;
    const t    = ctx.currentTime;
    const jitter = 0.8 + Math.random() * 0.4; // 80–120% pitch variance

    try {
      // Layer 1: Sharp metallic tick
      this._playNoise(ctx, t, {
        filterType: 'highpass', freqStart: 2800, freqEnd: 2800,
        Q: 0.7, vol: vol * 1.1, duration: 0.028
      });
      // Layer 2: Resonant zing — "metal on metal" decay
      this._playOsc(ctx, t, {
        type: 'sine',
        freqStart: 900 * jitter,
        freqEnd: Math.max(80, 120 * jitter),
        vol: vol * 0.75, duration: 0.06
      });
    } catch (e) {
      console.warn('ThrustAudio: playImpact failed —', e);
    }
  }

  /**
   * Thrust — continuous engine rumble.
   *
   * Mixing a looping noise source (filtered rumble) with a sawtooth oscillator
   * at the engine fundamental gives harmonic richness that plain noise lacks.
   *
   * Starts (active=true) or fades out (active=false) over ~120 ms.
   * Starting while already active is a no-op.
   *
   * @param {boolean} active
   */
  static async setThrust(active) {
    if (!this._isEnabled()) {
      if (this._thrustSource) this._stopThrustImmediate();
      return;
    }

    if (!active) {
      this._stopThrustFade(this._context);
      return;
    }

    // Fast path: skip async init when the context is already ready.
    let ctx = this._context;
    if (!ctx || ctx.state === 'closed' || !this._noiseBuffer) {
      ctx = await this.init();
    }
    if (!ctx || !this._noiseBuffer) return;
    if (this._thrustSource) return; // Re-check post-await

    try {
      const cfg = this._cfg();
      const t   = ctx.currentTime;

      // ── Noise layer — filtered rumble base ──────────────────────────────
      const noiseSrc    = this._noiseSource(ctx, /* loop */ true);
      const noiseFilter = ctx.createBiquadFilter();
      const noiseGain   = ctx.createGain();

      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(300, t);
      noiseFilter.Q.value = 0.8;

      noiseGain.gain.setValueAtTime(0, t);
      noiseGain.gain.linearRampToValueAtTime(cfg.THRUST_VOLUME, t + 0.15);

      noiseSrc.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      // ── Oscillator layer — engine fundamental (adds tonal body) ─────────
      const osc     = ctx.createOscillator();
      const oscGain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(58, t); // Low engine fundamental

      oscGain.gain.setValueAtTime(0, t);
      oscGain.gain.linearRampToValueAtTime(cfg.THRUST_VOLUME * 0.35, t + 0.18);

      osc.connect(oscGain);
      oscGain.connect(ctx.destination);

      this._thrustSource  = noiseSrc;
      this._thrustFilter  = noiseFilter;
      this._thrustGain    = noiseGain;
      this._thrustOsc     = osc;
      this._thrustOscGain = oscGain;

      noiseSrc.start();
      osc.start();
    } catch (e) {
      console.warn('ThrustAudio: setThrust(true) failed —', e);
    }
  }

  /** Kills all thrust nodes instantly. Safe when any node is null. */
  static _stopThrustImmediate() {
    const { _thrustSource: src, _thrustFilter: flt, _thrustGain: gain,
            _thrustOsc: osc, _thrustOscGain: oscGain } = this;

    this._thrustSource  = null;
    this._thrustFilter  = null;
    this._thrustGain    = null;
    this._thrustOsc     = null;
    this._thrustOscGain = null;

    try { src?.stop();  src?.disconnect();  } catch (_) {}
    try { flt?.disconnect();                } catch (_) {}
    try { gain?.disconnect();               } catch (_) {}
    try { osc?.stop();  osc?.disconnect();  } catch (_) {}
    try { oscGain?.disconnect();            } catch (_) {}
  }

  /**
   * Fades all thrust nodes out then disconnects. Re-entrant safe.
   * ctx may be null/closed — guarded internally.
   */
  static _stopThrustFade(ctx) {
    const { _thrustSource: src, _thrustFilter: flt, _thrustGain: gain,
            _thrustOsc: osc, _thrustOscGain: oscGain } = this;

    if (!src && !osc) return; // Nothing running

    this._thrustSource  = null;
    this._thrustFilter  = null;
    this._thrustGain    = null;
    this._thrustOsc     = null;
    this._thrustOscGain = null;

    const canFade = ctx && ctx.state === 'running';

    try {
      if (canFade) {
        const t = ctx.currentTime;

        if (gain) {
          const cur = gain.gain.value;
          gain.gain.cancelScheduledValues(t);
          gain.gain.setValueAtTime(cur, t);
          gain.gain.linearRampToValueAtTime(0, t + 0.12);
        }

        if (oscGain) {
          const cur = oscGain.gain.value;
          oscGain.gain.cancelScheduledValues(t);
          oscGain.gain.setValueAtTime(cur, t);
          oscGain.gain.linearRampToValueAtTime(0, t + 0.12);
        }

        try { src?.stop(t + 0.15); } catch (_) {}
        try { osc?.stop(t + 0.15); } catch (_) {}
      } else {
        try { src?.stop(); } catch (_) {}
        try { osc?.stop(); } catch (_) {}
      }
    } catch (_) {}

    setTimeout(() => {
      try { src?.disconnect();     } catch (_) {}
      try { flt?.disconnect();     } catch (_) {}
      try { gain?.disconnect();    } catch (_) {}
      try { osc?.disconnect();     } catch (_) {}
      try { oscGain?.disconnect(); } catch (_) {}
    }, 200);
  }

  /**
   * Fire — sharp plasma-bolt sound.
   *
   *  Layer 1: Attack crack  — very brief highpass burst (barrel discharge)
   *  Layer 2: Bolt sweep    — sawtooth sweep (richer harmonics than triangle)
   *
   * Short total duration (~90ms) keeps it decisive, not melodic.
   * Slight random pitch variance so rapid fire sounds organic.
   * Rate-limited to ~20 shots/sec.
   */
  static async playFire() {
    const ctx = await this._getCtx();
    if (!ctx) return;

    if (ctx.currentTime - this._lastFireTime < 0.05) return;
    this._lastFireTime = ctx.currentTime;

    if (this._activeVoices >= this._MAX_VOICES - 1) return; // needs 2 slots

    const vol    = this._cfg().FIRE_VOLUME;
    const t      = ctx.currentTime;
    const jitter = 0.85 + Math.random() * 0.3; // 85–115% pitch variance

    try {
      // Layer 1: Brief attack crack (highpass noise, 18ms)
      this._playNoise(ctx, t, {
        filterType: 'highpass', freqStart: 2200, freqEnd: 2200,
        Q: 0.5, vol: vol * 1.3, duration: 0.018
      });
      // Layer 2: Plasma bolt — sawtooth is harmonically rich, sounds punchy
      this._playOsc(ctx, t, {
        type: 'sawtooth',
        freqStart: 580 * jitter,
        freqEnd: Math.max(40, 55 * jitter),
        vol: vol * 0.85, duration: 0.09
      });
    } catch (e) {
      console.warn('ThrustAudio: playFire failed —', e);
    }
  }

  /**
   * Landing — weighted thud on touchdown.
   *
   *  Layer 1: Noise thud    — lowpass noise sweeping low (the mass of impact)
   *  Layer 2: Body sine     — sine punch for perceived weight on laptop speakers
   *
   * Debounced to once per 500 ms to absorb landing jitter.
   */
  static async playLanding() {
    const ctx = await this._getCtx();
    if (!ctx) return;

    if (ctx.currentTime - this._lastLandTime < 0.5) return;
    this._lastLandTime = ctx.currentTime;

    if (this._activeVoices >= this._MAX_VOICES - 1) return; // needs 2 slots

    const vol = this._cfg().LANDING_VOLUME;
    const t   = ctx.currentTime;

    try {
      // Layer 1: Main thud body
      this._playNoise(ctx, t, {
        filterType: 'lowpass', freqStart: 520, freqEnd: 55,
        vol: vol * 1.1, duration: 0.22
      });
      // Layer 2: Sine weight — audible on laptop speakers (120 Hz is not subsonic)
      this._playOsc(ctx, t, {
        type: 'sine', freqStart: 130, freqEnd: 42,
        vol: vol * 0.85, duration: 0.18
      });
    } catch (e) {
      console.warn('ThrustAudio: playLanding failed —', e);
    }
  }

  /**
   * Bounce — metallic clang on box collision.
   *
   *  Layer 1: Clang  — mid-range bandpass noise (the physical impact)
   *  Layer 2: Ring   — descending sine (metal resonance after impact)
   *
   * Pitched higher and decays faster than landing — clearly distinct.
   * Slight jitter prevents repetition feeling mechanical.
   * Debounced to once per 150 ms.
   */
  static async playBounce() {
    const ctx = await this._getCtx();
    if (!ctx) return;

    if (ctx.currentTime - this._lastBounceTime < 0.15) return;
    this._lastBounceTime = ctx.currentTime;

    if (this._activeVoices >= this._MAX_VOICES - 1) return; // needs 2 slots

    const vol    = this._cfg().BOUNCE_VOLUME;
    const t      = ctx.currentTime;
    const jitter = 0.8 + Math.random() * 0.4; // 80–120%

    try {
      // Layer 1: Mid-range clang
      this._playNoise(ctx, t, {
        filterType: 'bandpass',
        freqStart: 1100 * jitter, freqEnd: Math.max(200, 280 * jitter),
        Q: 2.5, vol, duration: 0.1
      });
      // Layer 2: Metallic ring decay
      this._playOsc(ctx, t, {
        type: 'sine',
        freqStart: 750 * jitter, freqEnd: Math.max(80, 90 * jitter),
        vol: vol * 0.65, duration: 0.09
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
