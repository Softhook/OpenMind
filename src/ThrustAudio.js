/**
 * ThrustAudio.js — Procedural audio synthesis for the Thrust mini-game.
 *
 * Design principles
 * -----------------
 *  • Zero external assets — all sounds are synthesised via the Web Audio API.
 *  • Flat volume — all sounds play at constant volume; no spatial attenuation.
 *  • Single AudioContext shared across all sounds; created lazily on first use.
 *  • All public methods are safe to call without guards — they fail silently.
 *  • Every allocated AudioNode is disconnected on completion to prevent leaks.
 *  • Voice limiting prevents node accumulation during rapid burst events.
 *  • Random noise buffer offset gives unique texture per event; no repetition.
 *  • Per-layer attack envelopes make sounds bloom naturally instead of clicking.
 */

class ThrustAudio {
  // ── Static state ──────────────────────────────────────────────────────────

  static _context     = null;
  static _noiseBuffer = null;
  static _initPromise = null;

  // All persistent thrust nodes in one object — makes lifecycle management clean.
  static _thrustNodes = null;

  // Per-sound debounce timestamps (AudioContext currentTime units).
  static _lastFireTime   = 0;
  static _lastLandTime   = 0;
  static _lastBounceTime = 0;

  // Voice limiter.
  static _activeVoices = 0;
  static _MAX_VOICES   = 16;

  // ── Config ────────────────────────────────────────────────────────────────

  static _cfg() {
    if (typeof ThrustConstants !== 'undefined' && ThrustConstants.AUDIO) {
      return ThrustConstants.AUDIO;
    }
    return {
      ENABLED: true,
      EXPLOSION_VOLUME: 0.65, IMPACT_VOLUME: 0.35,
      THRUST_VOLUME:    0.28, FIRE_VOLUME:   0.20,
      LANDING_VOLUME:   0.22, BOUNCE_VOLUME: 0.25
    };
  }

  static _isEnabled() { return this._cfg().ENABLED !== false; }

  // ── Initialisation ────────────────────────────────────────────────────────

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

        // 2 seconds of noise — longer buffer gives more unique texture per offset.
        const sr = this._context.sampleRate;
        this._noiseBuffer = this._context.createBuffer(1, sr * 2, sr);
        const data = this._noiseBuffer.getChannelData(0);
        for (let i = 0; i < sr * 2; i++) data[i] = Math.random() * 2 - 1;

        return this._context;
      } catch (e) {
        console.warn('ThrustAudio: init failed —', e);
        this._initPromise = null;
        return null;
      }
    })();

    return this._initPromise;
  }

  static async _getCtx() {
    if (!this._isEnabled()) return null;
    const ctx = await this.init();
    if (!ctx || !this._noiseBuffer) return null;
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    return ctx.state === 'running' ? ctx : null;
  }

  // ── Node helpers ──────────────────────────────────────────────────────────

  /**
   * White-noise source that always loops so random start offsets are seamless.
   * Looping white noise is perceptually identical to non-looping.
   */
  static _noiseSource(ctx) {
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    src.loop = true;
    return src;
  }

  /** Registers an onended handler that decrements the voice counter and disconnects nodes. */
  static _autoDisconnect(source, nodes) {
    source.onended = () => {
      this._activeVoices = Math.max(0, this._activeVoices - 1);
      for (const n of nodes) { try { n.disconnect(); } catch (_) {} }
    };
  }

  /**
   * Plays a filtered white-noise burst.
   *
   * @param {AudioContext} ctx
   * @param {number} t        — AudioContext timestamp (schedule from here).
   * @param {object} opts
   *   filterType, freqStart, freqEnd, Q=1, vol, duration,
   *   attack=0  — seconds to ramp from silence to vol before decaying.
   */
  static _playNoise(ctx, t, { filterType, freqStart, freqEnd, Q = 1, vol, duration, attack = 0 }) {
    const src    = this._noiseSource(ctx);
    const filter = ctx.createBiquadFilter();
    const gain   = ctx.createGain();

    filter.type = filterType;
    filter.frequency.setValueAtTime(freqStart, t);
    if (freqEnd !== freqStart && freqEnd > 0) {
      filter.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
    }
    if (Q !== 1) filter.Q.value = Q;

    if (attack > 0) {
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(vol, t + attack);
    } else {
      gain.gain.setValueAtTime(vol, t);
    }
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    this._autoDisconnect(src, [src, filter, gain]);

    src.start(t, Math.random() * 0.9); // random offset into the 2s buffer
    src.stop(t + duration);
    this._activeVoices++;
  }

  /**
   * Plays a frequency-swept oscillator.
   *
   * @param {AudioContext} ctx
   * @param {number} t        — AudioContext timestamp.
   * @param {object} opts
   *   type, freqStart, freqEnd, vol, duration,
   *   attack=0  — seconds to ramp from silence to vol before decaying.
   */
  static _playOsc(ctx, t, { type, freqStart, freqEnd, vol, duration, attack = 0 }) {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    if (freqEnd !== freqStart && freqEnd > 0) {
      osc.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
    }

    if (attack > 0) {
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(vol, t + attack);
    } else {
      gain.gain.setValueAtTime(vol, t);
    }
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(gain); gain.connect(ctx.destination);
    this._autoDisconnect(osc, [osc, gain]);

    osc.start(t); osc.stop(t + duration);
    this._activeVoices++;
  }

  // ── Public sound API ──────────────────────────────────────────────────────

  /**
   * Explosion — three staggered bands for a "crack then boom" bloom.
   *
   *  t+0.000: Crack   — highpass burst (the initial snap)
   *  t+0.010: Body    — bandpass noise with short attack (the boom opens up)
   *  t+0.005: Thump   — sine sweep with attack (low-end body, audible range)
   *
   * Staggering makes the layers feel physical rather than synthetic.
   */
  static async playExplosion(scale = 1.0) {
    const ctx = await this._getCtx();
    if (!ctx) return;
    if (this._activeVoices >= this._MAX_VOICES - 2) return;

    const s        = Math.max(0.4, Math.min(2.0, scale));
    const duration = 0.65 * s;
    const vol      = this._cfg().EXPLOSION_VOLUME * Math.min(1.2, s);
    const t        = ctx.currentTime;

    try {
      // Crack — arrives first, instant onset
      this._playNoise(ctx, t, {
        filterType: 'highpass', freqStart: 3200, freqEnd: 3200,
        Q: 0.5, vol: vol * 0.85, duration: 0.045
      });
      // Body — arrives 10ms later with a bloom attack so it "opens up"
      this._playNoise(ctx, t + 0.010, {
        filterType: 'bandpass', freqStart: 800, freqEnd: 55,
        Q: 0.5, vol, duration: duration - 0.010, attack: 0.012
      });
      // Thump — sine in audible range (not subsonic), 5ms after crack
      this._playOsc(ctx, t + 0.005, {
        type: 'sine', freqStart: 110, freqEnd: 38,
        vol: vol * 0.95, duration: duration * 0.65, attack: 0.006
      });
    } catch (e) {
      console.warn('ThrustAudio: playExplosion failed —', e);
    }
  }

  /**
   * Impact — metallic ricochet when a bullet damages but does not destroy a box.
   *
   *  Layer 1: Highpass tick   — the clink of metal
   *  Layer 2: Descending sine — resonant ring that gives it body
   *
   * Random pitch jitter: no two hits sound identical.
   */
  static async playImpact() {
    const ctx = await this._getCtx();
    if (!ctx) return;
    if (this._activeVoices >= this._MAX_VOICES - 1) return;

    const vol    = this._cfg().IMPACT_VOLUME;
    const t      = ctx.currentTime;
    const jitter = 0.80 + Math.random() * 0.40;

    try {
      this._playNoise(ctx, t, {
        filterType: 'highpass', freqStart: 2400, freqEnd: 2400,
        Q: 0.8, vol: vol * 1.2, duration: 0.030
      });
      this._playOsc(ctx, t, {
        type: 'sine',
        freqStart: 950 * jitter, freqEnd: Math.max(100, 130 * jitter),
        vol: vol * 0.80, duration: 0.070, attack: 0.002
      });
    } catch (e) {
      console.warn('ThrustAudio: playImpact failed —', e);
    }
  }

  /**
   * Thrust — continuous engine rumble.
   *
   * Noise layer:       bandpass noise (the exhaust hiss)
   * LFO:               5 Hz sine modulating filter cutoff ±70 Hz — engine "breathing"
   * Oscillator layer:  sawtooth at 58 Hz (engine fundamental, adds tonal body)
   *
   * All nodes stored in _thrustNodes for atomic start/stop.
   */
  static async setThrust(active) {
    if (!this._isEnabled()) {
      if (this._thrustNodes) this._stopThrustImmediate();
      return;
    }

    if (!active) {
      this._stopThrustFade(this._context);
      return;
    }

    let ctx = this._context;
    if (!ctx || ctx.state === 'closed' || !this._noiseBuffer) {
      ctx = await this.init();
    }
    if (!ctx || !this._noiseBuffer) return;
    if (this._thrustNodes) return; // Re-check post-await

    try {
      const cfg = this._cfg();
      const t   = ctx.currentTime;

      const noiseSrc    = this._noiseSource(ctx);
      const noiseFilter = ctx.createBiquadFilter();
      const noiseGain   = ctx.createGain();

      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(400, t);

      noiseGain.gain.setValueAtTime(0, t);
      noiseGain.gain.linearRampToValueAtTime(cfg.THRUST_VOLUME, t + 0.12);

      noiseSrc.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      this._thrustNodes = { noiseSrc, noiseFilter, noiseGain };

      noiseSrc.start(t, Math.random() * 0.9);
    } catch (e) {
      console.warn('ThrustAudio: setThrust(true) failed —', e);
    }
  }

  static _stopThrustImmediate() {
    const n = this._thrustNodes;
    this._thrustNodes = null;
    if (!n) return;
    try { n.noiseSrc?.stop(); n.noiseSrc?.disconnect(); } catch (_) {}
    for (const node of [n.noiseFilter, n.noiseGain]) {
      try { node?.disconnect(); } catch (_) {}
    }
  }

  static _stopThrustFade(ctx) {
    const n = this._thrustNodes;
    if (!n) return;
    this._thrustNodes = null;

    const canFade = ctx && ctx.state === 'running';
    try {
      if (canFade) {
        const t = ctx.currentTime;
        if (n.noiseGain) {
          const cur = n.noiseGain.gain.value;
          n.noiseGain.gain.cancelScheduledValues(t);
          n.noiseGain.gain.setValueAtTime(cur, t);
          n.noiseGain.gain.linearRampToValueAtTime(0, t + 0.12);
        }
        try { n.noiseSrc?.stop(t + 0.15); } catch (_) {}
      } else {
        try { n.noiseSrc?.stop(); } catch (_) {}
      }
    } catch (_) {}

    setTimeout(() => {
      for (const node of [n.noiseSrc, n.noiseFilter, n.noiseGain]) {
        try { node?.disconnect(); } catch (_) {}
      }
    }, 200);
  }

  /**
   * Fire — sharp plasma crack + square-wave bolt sweep.
   *
   * Square wave chosen over sawtooth: its odd-harmonic series (fundamental,
   * 3rd, 5th, 7th...) sounds punchier and more "arcade" than the buzzy quality
   * of sawtooth's full harmonic series.
   *
   * Endpoint stays at 200 Hz (audible on laptops) not 55 Hz (inaudible).
   * Total duration 65 ms — decisive, not melodic.
   * Random ±12% pitch jitter prevents mechanical repetition.
   */
  static async playFire() {
    const ctx = await this._getCtx();
    if (!ctx) return;

    if (ctx.currentTime - this._lastFireTime < 0.05) return;
    this._lastFireTime = ctx.currentTime;
    if (this._activeVoices >= this._MAX_VOICES - 1) return;

    const vol    = this._cfg().FIRE_VOLUME;
    const t      = ctx.currentTime;
    const jitter = 0.88 + Math.random() * 0.24;

    try {
      // Brief crack — the barrel discharge
      this._playNoise(ctx, t, {
        filterType: 'highpass', freqStart: 2600, freqEnd: 2600,
        Q: 0.6, vol: vol * 1.4, duration: 0.020
      });
      // Square-wave bolt — punchy, harmonically rich, classic arcade
      this._playOsc(ctx, t, {
        type: 'square',
        freqStart: 560 * jitter, freqEnd: Math.max(180, 200 * jitter),
        vol: vol * 0.85, duration: 0.065
      });
    } catch (e) {
      console.warn('ThrustAudio: playFire failed —', e);
    }
  }

  /**
   * Landing — weighted thud when the ship touches down.
   *
   * Short attack (6 ms) makes it feel like mass arriving rather than
   * a sample being switched on. Sine layer at 130 Hz stays fully audible
   * on laptop speakers (130 Hz is well above the roll-off point).
   *
   * Debounced to once per 500 ms.
   */
  static async playLanding() {
    const ctx = await this._getCtx();
    if (!ctx) return;

    if (ctx.currentTime - this._lastLandTime < 0.5) return;
    this._lastLandTime = ctx.currentTime;
    if (this._activeVoices >= this._MAX_VOICES - 1) return;

    const vol = this._cfg().LANDING_VOLUME;
    const t   = ctx.currentTime;

    try {
      this._playNoise(ctx, t, {
        filterType: 'lowpass', freqStart: 540, freqEnd: 50,
        vol: vol * 1.2, duration: 0.26, attack: 0.006
      });
      this._playOsc(ctx, t, {
        type: 'sine', freqStart: 130, freqEnd: 44,
        vol: vol * 0.90, duration: 0.22, attack: 0.005
      });
    } catch (e) {
      console.warn('ThrustAudio: playLanding failed —', e);
    }
  }

  /**
   * Bounce — metallic clang on box collision.
   *
   * Higher-pitched and shorter than landing — unmistakably different.
   * Triangle wave for the ring: softer than square, giving a "clang"
   * quality rather than a "buzz."
   *
   * Debounced to once per 150 ms.
   */
  static async playBounce() {
    const ctx = await this._getCtx();
    if (!ctx) return;

    if (ctx.currentTime - this._lastBounceTime < 0.15) return;
    this._lastBounceTime = ctx.currentTime;
    if (this._activeVoices >= this._MAX_VOICES - 1) return;

    const vol    = this._cfg().BOUNCE_VOLUME;
    const t      = ctx.currentTime;
    const jitter = 0.82 + Math.random() * 0.36;

    try {
      // Mid-range impact noise — the physical collision
      this._playNoise(ctx, t, {
        filterType: 'bandpass',
        freqStart: 1200 * jitter, freqEnd: Math.max(220, 260 * jitter),
        Q: 2.2, vol: vol * 1.1, duration: 0.085
      });
      // Metallic ring — triangle for a clean "clang" not a "buzz"
      this._playOsc(ctx, t, {
        type: 'triangle',
        freqStart: 1500 * jitter, freqEnd: Math.max(100, 130 * jitter),
        vol: vol * 0.60, duration: 0.075
      });
    } catch (e) {
      console.warn('ThrustAudio: playBounce failed —', e);
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ThrustAudio;
} else {
  window.ThrustAudio = ThrustAudio;
}
