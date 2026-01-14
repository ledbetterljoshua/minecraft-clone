// Sound system using Web Audio API with procedurally generated sounds
// No external files needed!

class SoundGenerator {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private initialized = false;
  private currentAmbient: {
    sources: AudioScheduledSourceNode[];
    dimension: 'overworld' | 'nether' | 'end';
  } | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.3;
      this.masterGain.connect(this.ctx.destination);

      // Separate gain node for ambient sounds (lower volume)
      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.value = 0.15;
      this.ambientGain.connect(this.ctx.destination);

      this.initialized = true;
    } catch (e) {
      console.warn('Audio not available:', e);
    }
  }

  private ensureContext(): AudioContext | null {
    if (!this.ctx || !this.initialized) return null;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  // Footstep - short thump
  playFootstep(surface: 'grass' | 'stone' | 'sand' | 'wood' = 'grass'): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    filter.type = 'lowpass';

    switch (surface) {
      case 'grass':
        osc.frequency.value = 80 + Math.random() * 40;
        filter.frequency.value = 300;
        break;
      case 'stone':
        osc.frequency.value = 150 + Math.random() * 50;
        filter.frequency.value = 800;
        break;
      case 'sand':
        osc.frequency.value = 60 + Math.random() * 30;
        filter.frequency.value = 200;
        break;
      case 'wood':
        osc.frequency.value = 200 + Math.random() * 100;
        filter.frequency.value = 1000;
        break;
    }

    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  }

  // Block break - crunch
  playBlockBreak(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    // Noise burst
    const bufferSize = ctx.sampleRate * 0.15;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 1;

    const gain = ctx.createGain();
    gain.gain.value = 0.3;

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start();
  }

  // Block place - thunk
  playBlockPlace(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  }

  // Hit/damage - oof
  playHurt(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.2);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  }

  // Explosion - BOOM
  playExplosion(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    // Low boom
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.5);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.5, ctx.currentTime);
    oscGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);

    // Noise burst
    const bufferSize = ctx.sampleRate * 0.4;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.5);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1000;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.4;

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    noise.start();
  }

  // Zombie groan
  playZombieGroan(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    const baseFreq = 80 + Math.random() * 40;
    osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
    osc.frequency.setValueAtTime(baseFreq * 0.9, ctx.currentTime + 0.3);
    osc.frequency.setValueAtTime(baseFreq * 0.7, ctx.currentTime + 0.6);

    filter.type = 'lowpass';
    filter.frequency.value = 400;

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.1);
    gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.5);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(ctx.currentTime + 0.8);
  }

  // Skeleton rattle
  playSkeletonRattle(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    for (let i = 0; i < 4; i++) {
      const delay = i * 0.05;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.value = 800 + Math.random() * 600;

      gain.gain.setValueAtTime(0.1, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.05);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.05);
    }
  }

  // Creeper hiss - the iconic sound
  playCreeperHiss(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    // White noise with envelope
    const bufferSize = ctx.sampleRate * 1.5;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      const t = i / ctx.sampleRate;
      // Pulsing intensity
      const pulse = Math.sin(t * 15) * 0.3 + 0.7;
      // Rising intensity
      const rise = Math.min(1, t * 2);
      data[i] = (Math.random() * 2 - 1) * pulse * rise;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2000;

    const gain = ctx.createGain();
    gain.gain.value = 0.25;

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start();
  }

  // Eating sound
  playEat(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    for (let i = 0; i < 3; i++) {
      const delay = i * 0.15;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.value = 200 + Math.random() * 100;

      gain.gain.setValueAtTime(0.1, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.1);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.1);
    }
  }

  // Ambient wind (returns stop function)
  playAmbientWind(): () => void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return () => {};

    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.5;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;

    const gain = ctx.createGain();
    gain.gain.value = 0.05;

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start();

    return () => noise.stop();
  }

  // Pop sound for item pickup
  playPop(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  }

  // Mining progress tick
  playMiningTick(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.value = 100 + Math.random() * 50;

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }

  // Death sound
  playDeath(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.8);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(ctx.currentTime + 0.8);
  }

  // Dragon roar - deep growl for when dragon dives
  playDragonRoar(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    // Low growling oscillator
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(45, ctx.currentTime);
    osc1.frequency.linearRampToValueAtTime(55, ctx.currentTime + 0.3);
    osc1.frequency.linearRampToValueAtTime(35, ctx.currentTime + 1.0);

    // Second oscillator for depth
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(90, ctx.currentTime);
    osc2.frequency.linearRampToValueAtTime(110, ctx.currentTime + 0.3);
    osc2.frequency.linearRampToValueAtTime(70, ctx.currentTime + 1.0);

    // Add some noise for texture
    const bufferSize = ctx.sampleRate * 1.2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize;
      const envelope = Math.sin(t * Math.PI) * 0.3;
      data[i] = (Math.random() * 2 - 1) * envelope;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 200;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.2;

    // Main filter for the roar
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.Q.value = 2;

    // Envelope
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.15);
    gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.5);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2);

    osc1.connect(filter);
    osc2.connect(filter);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc1.start();
    osc2.start();
    noise.start();
    osc1.stop(ctx.currentTime + 1.2);
    osc2.stop(ctx.currentTime + 1.2);
  }

  // Enderman teleport - short staticky pop
  playEndermanTeleport(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    // Create brief static burst
    const bufferSize = ctx.sampleRate * 0.15;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize;
      const envelope = Math.exp(-t * 8);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // High frequency content
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1500;

    // Quick pitch bend for "pop" effect
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.08);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.15, ctx.currentTime);
    oscGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

    const gain = ctx.createGain();
    gain.gain.value = 0.25;

    noise.connect(filter);
    filter.connect(gain);
    osc.connect(oscGain);
    oscGain.connect(gain);
    gain.connect(this.masterGain);

    noise.start();
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  }

  // Overworld ambient - gentle wind and nature sounds
  private playOverworldAmbient(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.ambientGain) return;

    const sources: AudioScheduledSourceNode[] = [];

    // Gentle wind - low frequency noise
    const windBuffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const windData = windBuffer.getChannelData(0);
    for (let i = 0; i < windData.length; i++) {
      windData[i] = (Math.random() * 2 - 1) * 0.3;
    }

    const wind = ctx.createBufferSource();
    wind.buffer = windBuffer;
    wind.loop = true;

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 300;

    const windGain = ctx.createGain();
    windGain.gain.value = 0.4;

    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(this.ambientGain);
    wind.start();
    sources.push(wind);

    // Subtle droning tone
    const drone = ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 110; // Low A

    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.15;

    drone.connect(droneGain);
    droneGain.connect(this.ambientGain);
    drone.start();
    sources.push(drone);

    this.currentAmbient = { sources, dimension: 'overworld' };
  }

  // Nether ambient - low rumbling with fire crackle
  private playNetherAmbient(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.ambientGain) return;

    const sources: AudioScheduledSourceNode[] = [];

    // Deep rumble - very low frequency oscillators
    const rumble1 = ctx.createOscillator();
    rumble1.type = 'sawtooth';
    rumble1.frequency.value = 30;

    const rumble2 = ctx.createOscillator();
    rumble2.type = 'sine';
    rumble2.frequency.value = 45;

    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.5;

    rumble1.connect(rumbleGain);
    rumble2.connect(rumbleGain);
    rumbleGain.connect(this.ambientGain);
    rumble1.start();
    rumble2.start();
    sources.push(rumble1, rumble2);

    // Fire crackle - filtered noise bursts
    const crackleBuffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const crackleData = crackleBuffer.getChannelData(0);
    for (let i = 0; i < crackleData.length; i++) {
      const t = i / ctx.sampleRate;
      // Random bursts
      const burst = Math.sin(t * 3 + Math.random() * 10) > 0.7 ? 1 : 0.1;
      crackleData[i] = (Math.random() * 2 - 1) * burst * 0.5;
    }

    const crackle = ctx.createBufferSource();
    crackle.buffer = crackleBuffer;
    crackle.loop = true;

    const crackleFilter = ctx.createBiquadFilter();
    crackleFilter.type = 'bandpass';
    crackleFilter.frequency.value = 1200;
    crackleFilter.Q.value = 2;

    const crackleGain = ctx.createGain();
    crackleGain.gain.value = 0.3;

    crackle.connect(crackleFilter);
    crackleFilter.connect(crackleGain);
    crackleGain.connect(this.ambientGain);
    crackle.start();
    sources.push(crackle);

    // Low frequency modulation for uneasiness
    const mod = ctx.createOscillator();
    mod.type = 'triangle';
    mod.frequency.value = 0.5; // Very slow

    const modGain = ctx.createGain();
    modGain.gain.value = 0.2;

    mod.connect(modGain);
    modGain.connect(this.ambientGain);
    mod.start();
    sources.push(mod);

    this.currentAmbient = { sources, dimension: 'nether' };
  }

  // End ambient - eerie high-pitched hum with whooshing
  private playEndAmbient(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.ambientGain) return;

    const sources: AudioScheduledSourceNode[] = [];

    // Eerie high-pitched drone
    const drone1 = ctx.createOscillator();
    drone1.type = 'sine';
    drone1.frequency.value = 880; // A5

    const drone2 = ctx.createOscillator();
    drone2.type = 'sine';
    drone2.frequency.value = 890; // Slightly detuned for beating effect

    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.25;

    drone1.connect(droneGain);
    drone2.connect(droneGain);
    droneGain.connect(this.ambientGain);
    drone1.start();
    drone2.start();
    sources.push(drone1, drone2);

    // Wind-like whooshing - filtered noise
    const whooshBuffer = ctx.createBuffer(1, ctx.sampleRate * 5, ctx.sampleRate);
    const whooshData = whooshBuffer.getChannelData(0);
    for (let i = 0; i < whooshData.length; i++) {
      const t = i / ctx.sampleRate;
      // Slow oscillation in intensity
      const intensity = Math.sin(t * 0.8) * 0.3 + 0.5;
      whooshData[i] = (Math.random() * 2 - 1) * intensity;
    }

    const whoosh = ctx.createBufferSource();
    whoosh.buffer = whooshBuffer;
    whoosh.loop = true;

    const whooshFilter = ctx.createBiquadFilter();
    whooshFilter.type = 'bandpass';
    whooshFilter.frequency.value = 600;
    whooshFilter.Q.value = 1;

    const whooshGain = ctx.createGain();
    whooshGain.gain.value = 0.3;

    whoosh.connect(whooshFilter);
    whooshFilter.connect(whooshGain);
    whooshGain.connect(this.ambientGain);
    whoosh.start();
    sources.push(whoosh);

    // Very low rumble for depth
    const lowDrone = ctx.createOscillator();
    lowDrone.type = 'triangle';
    lowDrone.frequency.value = 55;

    const lowGain = ctx.createGain();
    lowGain.gain.value = 0.2;

    lowDrone.connect(lowGain);
    lowGain.connect(this.ambientGain);
    lowDrone.start();
    sources.push(lowDrone);

    this.currentAmbient = { sources, dimension: 'end' };
  }

  // Start ambient sound for a dimension
  startAmbient(dimension: 'overworld' | 'nether' | 'end'): void {
    // Stop current ambient if playing
    this.stopAmbient();

    // Start new ambient
    switch (dimension) {
      case 'overworld':
        this.playOverworldAmbient();
        break;
      case 'nether':
        this.playNetherAmbient();
        break;
      case 'end':
        this.playEndAmbient();
        break;
    }
  }

  // Stop ambient sound
  stopAmbient(): void {
    if (this.currentAmbient) {
      this.currentAmbient.sources.forEach(source => {
        try {
          source.stop();
        } catch (e) {
          // Source might already be stopped
        }
      });
      this.currentAmbient = null;
    }
  }

  // Set ambient volume (0-1)
  setAmbientVolume(volume: number): void {
    if (this.ambientGain) {
      this.ambientGain.gain.value = Math.max(0, Math.min(1, volume));
    }
  }
}

export const sound = new SoundGenerator();
