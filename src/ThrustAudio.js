/**
 * ThrustAudio.js - Procedural audio generation for Thrust game.
 * Uses Web Audio API to synthesize sounds on demand.
 */
class ThrustAudio {
  static context = null;
  static whiteNoiseBuffer = null;
  static thrustNode = null;
  static thrustGain = null;
  static initPromise = null;

  static init() {
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = (async () => {
      if (this.context) {
        if (this.context.state === 'suspended') await this.context.resume().catch(() => {});
        return this.context;
      }

      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return null;
        this.context = new AudioContext();

        // Pre-create 0.5s of white noise (enough for short bursts)
        const bufferSize = this.context.sampleRate * 0.5;
        this.whiteNoiseBuffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
        const data = this.whiteNoiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
      } catch (e) {
        console.warn('ThrustAudio: Initialization failed', e);
        return null;
      }
      return this.context;
    })();

    return this.initPromise;
  }

  static async playExplosion(type = 'player', scale = 1.0, x, y) {
    if (typeof ThrustConstants !== 'undefined' && ThrustConstants.AUDIO && !ThrustConstants.AUDIO.ENABLED) return;
    
    const ctx = await this.init();
    if (!ctx || !this.whiteNoiseBuffer) return;

    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }

    // Distance attenuation - explosions further away are quieter
    let attenuation = 1.0;
    if (x !== undefined && y !== undefined && typeof CameraUtils !== 'undefined' && typeof width !== 'undefined') {
      const centerX = CameraUtils.worldX(width / 2);
      const centerY = CameraUtils.worldY(height / 2);
      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Fall off over 3000 pixels
      const maxDistance = 3000;
      attenuation = Math.max(0, 1 - (distance / maxDistance));
      
      // Early exit if too far to hear
      if (attenuation <= 0.05) return;
      
      // Logarithmic-ish falloff feels more natural
      attenuation = Math.pow(attenuation, 1.5);
    }

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    
    const gain = ctx.createGain();
    
    // Duration based on type and scale
    const baseDuration = (type === 'box') ? 0.25 : 0.6;
    const duration = baseDuration * Math.max(0.6, Math.min(1.5, scale));
    
    // Volume envelope - quick hit then fade
    try {
      const baseVol = (typeof ThrustConstants !== 'undefined' && ThrustConstants.AUDIO) 
                      ? (type === 'box' ? ThrustConstants.AUDIO.BOX_EXPLOSION_VOLUME : ThrustConstants.AUDIO.EXPLOSION_VOLUME) 
                      : (type === 'box' ? 0.25 : 0.45);
      
      const startFreq = (type === 'box') ? 600 : 1200;
      const volume = baseVol * Math.min(1.2, scale) * attenuation;
      
      // Layer 1: The Noise (Crack/Hiss)
      const source = ctx.createBufferSource();
      source.buffer = this.whiteNoiseBuffer;
      const noiseGain = ctx.createGain();
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(startFreq, ctx.currentTime);
      noiseFilter.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + duration);
      
      noiseGain.gain.setValueAtTime(volume, ctx.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      
      source.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      source.start();
      source.stop(ctx.currentTime + duration);

      // Layer 2: The Thump (Sub-bass Sine sweep)
      if (type !== 'box' || scale > 1.2) {
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(type === 'box' ? 100 : 160, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + duration * 0.8);
        
        oscGain.gain.setValueAtTime(volume * 0.8, ctx.currentTime);
        oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration * 0.8);
        
        osc.connect(oscGain);
        oscGain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration * 0.8);
      }
    } catch (e) {
      console.warn('ThrustAudio: Play failed', e);
    }
  }

  static async playImpact(x, y) {
    if (typeof ThrustConstants !== 'undefined' && ThrustConstants.AUDIO && !ThrustConstants.AUDIO.ENABLED) return;
    const ctx = await this.init();
    if (!ctx || !this.whiteNoiseBuffer) return;

    let attenuation = 1.0;
    if (x !== undefined && y !== undefined && typeof CameraUtils !== 'undefined' && typeof width !== 'undefined') {
      const centerX = CameraUtils.worldX(width / 2);
      const centerY = CameraUtils.worldY(height / 2);
      const distance = Math.sqrt((x - centerX)**2 + (y - centerY)**2);
      attenuation = Math.max(0, 1 - (distance / 2000));
      if (attenuation <= 0.05) return;
      attenuation = Math.pow(attenuation, 1.5);
    }

    try {
      const source = ctx.createBufferSource();
      source.buffer = this.whiteNoiseBuffer;
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2500, ctx.currentTime);
      filter.Q.value = 10;

      const baseVol = (typeof ThrustConstants !== 'undefined' && ThrustConstants.AUDIO) 
                      ? ThrustConstants.AUDIO.IMPACT_VOLUME 
                      : 0.1;
      
      gain.gain.setValueAtTime(baseVol * attenuation, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      source.start();
      source.stop(ctx.currentTime + 0.05);
    } catch (e) {}
  }

  static async setThrust(active) {
    if (typeof ThrustConstants !== 'undefined' && ThrustConstants.AUDIO && !ThrustConstants.AUDIO.ENABLED) {
      if (this.thrustNode) this.stopThrust();
      return;
    }
    
    const ctx = await this.init();
    if (!ctx || !this.whiteNoiseBuffer) return;

    if (active) {
      if (this.thrustNode) return; // Already active
      
      try {
        this.thrustNode = ctx.createBufferSource();
        this.thrustNode.buffer = this.whiteNoiseBuffer;
        this.thrustNode.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(150, ctx.currentTime);

        this.thrustGain = ctx.createGain();
        const baseVol = (typeof ThrustConstants !== 'undefined' && ThrustConstants.AUDIO) 
                        ? ThrustConstants.AUDIO.THRUST_VOLUME 
                        : 0.15;
        
        this.thrustGain.gain.setValueAtTime(0, ctx.currentTime);
        this.thrustGain.gain.linearRampToValueAtTime(baseVol, ctx.currentTime + 0.1);

        this.thrustNode.connect(filter);
        filter.connect(this.thrustGain);
        this.thrustGain.connect(ctx.destination);

        this.thrustNode.start();
      } catch (e) {
        console.warn('ThrustAudio: Thrust start failed', e);
      }
    } else {
      this.stopThrust();
    }
  }

  static stopThrust() {
    if (this.thrustGain && this.context) {
      try {
        const ctx = this.context;
        const gain = this.thrustGain;
        const node = this.thrustNode;
        
        const currentVal = gain.gain.value;
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setValueAtTime(currentVal, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
        
        setTimeout(() => {
          try {
            node.stop();
            node.disconnect();
            gain.disconnect();
          } catch (e) {}
        }, 150);
      } catch (e) {}
    }
    this.thrustNode = null;
    this.thrustGain = null;
  }

  static async playFire(x, y) {
    if (typeof ThrustConstants !== 'undefined' && ThrustConstants.AUDIO && !ThrustConstants.AUDIO.ENABLED) return;
    const ctx = await this.init();
    if (!ctx || !this.whiteNoiseBuffer) return;

    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }

    let attenuation = 1.0;
    if (x !== undefined && y !== undefined && typeof CameraUtils !== 'undefined' && typeof width !== 'undefined') {
      const centerX = CameraUtils.worldX(width / 2);
      const centerY = CameraUtils.worldY(height / 2);
      const distance = Math.sqrt((x - centerX)**2 + (y - centerY)**2);
      attenuation = Math.max(0, 1 - (distance / 2500));
      if (attenuation <= 0.01) return;
      attenuation = Math.pow(attenuation, 2);
    }

    try {
      const source = ctx.createBufferSource();
      source.buffer = this.whiteNoiseBuffer;
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.1);
      filter.Q.value = 5;

      const baseVol = (typeof ThrustConstants !== 'undefined' && ThrustConstants.AUDIO) 
                      ? ThrustConstants.AUDIO.FIRE_VOLUME 
                      : 0.12;
      
      gain.gain.setValueAtTime(baseVol * attenuation, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      source.start();
      source.stop(ctx.currentTime + 0.1);
    } catch (e) {
      console.warn('ThrustAudio: Fire failed', e);
    }
  }

  static cleanup() {
    this.stopThrust();
    if (this.context) {
      try {
        this.context.close().catch(() => {});
      } catch (e) {}
      this.context = null;
      this.whiteNoiseBuffer = null;
      this.initPromise = null;
    }
  }
}

// Export for module use if available
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ThrustAudio;
} else {
  // Otherwise attach to window for global access
  window.ThrustAudio = ThrustAudio;
}
