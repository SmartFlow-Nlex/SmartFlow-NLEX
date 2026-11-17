/**
 * All sound is synthesised, so every effect is original and the page needs no files:
 * a forest soundscape of air, leaves and small bird calls, restrained music, and clear
 * interaction sounds. Created on the first tap, suspended when paused or hidden.
 */

export type Sfx = 'tap' | 'switch' | 'ok' | 'deny' | 'step' | 'done' | 'scan' | 'pickup' | 'drop' | 'stretch' | 'note1' | 'note2' | 'note3' | 'flag' | 'hornbill' | 'star' | 'whoosh' | 'hum' | 'snap' | 'chirp' | 'croak';

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private ambience: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private soundOn = true;
  private musicOn = true;
  private timer: number | null = null;
  private nextBeat = 0;
  private beat = 0;
  private nextBird = 0;
  private region: 'forest' | 'station' | 'none' = 'none';
  private hum: { gain: GainNode; osc: OscillatorNode } | null = null;
  /** Quiet beds under the place: distant traffic by the expressway, running water by the creek. 0..1 each. */
  private beds = { traffic: 0, water: 0 };
  private trafficGain: GainNode | null = null;
  private waterGain: GainNode | null = null;
  private lastStep = 0;

  unlock(): void {
    if (this.ctx === null) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor === undefined) {
        return;
      }
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.soundOn ? 0.9 : 0;
      this.master.connect(ctx.destination);
      this.music = ctx.createGain();
      this.music.gain.value = this.musicOn ? 0.5 : 0;
      this.music.connect(this.master);
      this.ambience = ctx.createGain();
      this.ambience.gain.value = 0.5;
      this.ambience.connect(this.master);
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i += 1) {
        last = last * 0.97 + (Math.random() * 2 - 1) * 0.03;
        data[i] = last * 5;
      }
      const air = ctx.createBufferSource();
      air.buffer = this.noise;
      air.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 700;
      const gain = ctx.createGain();
      gain.gain.value = 0.16;
      air.connect(filter).connect(gain).connect(this.ambience);
      air.start();
      /* Traffic far off: a low rumble that swells and fades slowly. */
      const road = ctx.createBufferSource();
      road.buffer = this.noise;
      road.loop = true;
      road.playbackRate.value = 0.6;
      const roadLow = ctx.createBiquadFilter();
      roadLow.type = 'lowpass';
      roadLow.frequency.value = 260;
      this.trafficGain = ctx.createGain();
      this.trafficGain.gain.value = 0;
      road.connect(roadLow).connect(this.trafficGain).connect(this.ambience);
      road.start();
      /* Water: a bright band of noise with a quick, uneven flutter, like a stream over stones. */
      const stream = ctx.createBufferSource();
      stream.buffer = this.noise;
      stream.loop = true;
      stream.playbackRate.value = 1.7;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1300;
      band.Q.value = 0.8;
      this.waterGain = ctx.createGain();
      this.waterGain.gain.value = 0;
      stream.connect(band).connect(this.waterGain).connect(this.ambience);
      stream.start();
      this.applyBeds();
      this.timer = window.setInterval(() => this.tick(), 120);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }
  }

  setOptions(sound: boolean, music: boolean): void {
    this.soundOn = sound;
    this.musicOn = music;
    if (this.master !== null) {
      this.master.gain.value = sound ? 0.9 : 0;
    }
    if (this.music !== null) {
      this.music.gain.value = music ? 0.5 : 0;
    }
  }

  setRegion(region: 'forest' | 'station' | 'none', beds: { traffic?: number; water?: number } = {}): void {
    this.region = region;
    this.beds = { traffic: beds.traffic ?? 0, water: beds.water ?? 0 };
    this.applyBeds();
  }

  private applyBeds(): void {
    const ctx = this.ctx;
    if (ctx === null || this.trafficGain === null || this.waterGain === null) {
      return;
    }
    this.trafficGain.gain.setTargetAtTime(this.beds.traffic * 0.22, ctx.currentTime, 0.6);
    this.waterGain.gain.setTargetAtTime(this.beds.water * 0.05, ctx.currentTime, 0.6);
  }

  /** One soft footstep: a short tap of filtered noise, its colour set by what is underfoot. */
  footstep(surface: 'grass' | 'hard' | 'wood' | 'water'): void {
    const ctx = this.ctx;
    if (ctx === null || ctx.state !== 'running' || this.master === null || this.noise === null) {
      return;
    }
    const t = ctx.currentTime;
    if (t - this.lastStep < 0.12) {
      return;
    }
    this.lastStep = t;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;
    const f = ctx.createBiquadFilter();
    const shape: Record<typeof surface, { type: BiquadFilterType; freq: number; gain: number; len: number }> = {
      grass: { type: 'bandpass', freq: 1800, gain: 0.05, len: 0.07 },
      hard: { type: 'bandpass', freq: 900, gain: 0.07, len: 0.05 },
      wood: { type: 'lowpass', freq: 600, gain: 0.11, len: 0.07 },
      water: { type: 'highpass', freq: 1400, gain: 0.07, len: 0.12 },
    };
    const sh = shape[surface];
    f.type = sh.type;
    f.frequency.value = sh.freq * (0.9 + Math.random() * 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(sh.gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + sh.len);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5, sh.len + 0.03);
    if (surface === 'wood') {
      this.tone(170 + Math.random() * 30, t, 0.06, 0.04, 'triangle');
    }
  }

  suspend(): void {
    if (this.ctx !== null && this.ctx.state === 'running') {
      void this.ctx.suspend().catch(() => undefined);
    }
  }

  dispose(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
    }
    void this.ctx?.close().catch(() => undefined);
  }

  private tone(f: number, at: number, len: number, gainValue: number, type: OscillatorType, to?: number, out?: AudioNode): void {
    const ctx = this.ctx;
    if (ctx === null || this.master === null) {
      return;
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, at);
    if (to !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(to, at + len);
    }
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(gainValue, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + len);
    osc.connect(gain).connect(out ?? this.master);
    osc.start(at);
    osc.stop(at + len + 0.02);
  }

  /** A soft marimba-like loop, and small birds in the leaves. */
  private tick(): void {
    const ctx = this.ctx;
    if (ctx === null || ctx.state !== 'running' || this.region === 'none') {
      return;
    }
    const now = ctx.currentTime;
    if (this.waterGain !== null && this.beds.water > 0) {
      this.waterGain.gain.setTargetAtTime(this.beds.water * (0.035 + Math.random() * 0.03), now, 0.05);
    }
    if (this.trafficGain !== null && this.beds.traffic > 0) {
      this.trafficGain.gain.setTargetAtTime(this.beds.traffic * (0.16 + 0.08 * Math.sin(now * 0.35)), now, 0.4);
    }
    if (this.nextBeat < now) {
      this.nextBeat = now + 0.1;
    }
    const SCALE = this.region === 'forest' ? [293.66, 329.63, 369.99, 440, 493.88] : [261.63, 293.66, 329.63, 392, 440];
    const PATTERN = [0, -1, 2, -1, 4, 3, -1, 1, 0, -1, 3, -1, 2, 4, -1, -1];
    while (this.nextBeat < now + 0.3) {
      const step = PATTERN[this.beat % PATTERN.length];
      if (step >= 0) {
        this.tone(SCALE[step], this.nextBeat, 0.45, 0.07, 'sine', undefined, this.music ?? undefined);
        this.tone(SCALE[step] * 2, this.nextBeat, 0.16, 0.02, 'triangle', undefined, this.music ?? undefined);
      }
      if (this.beat % 8 === 0) {
        this.tone(SCALE[0] / 2, this.nextBeat, 0.9, 0.05, 'sine', undefined, this.music ?? undefined);
      }
      this.nextBeat += 0.3;
      this.beat += 1;
    }
    if (now > this.nextBird) {
      const f = 1800 + Math.random() * 1600;
      const count = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i += 1) {
        this.tone(f, now + i * 0.13, 0.09, 0.012, 'sine', f * (0.8 + Math.random() * 0.5), this.ambience ?? undefined);
      }
      this.nextBird = now + 1.5 + Math.random() * 4;
    }
  }

  /** `volume` scales the louder sounds, so a bird far off sings quietly. */
  play(name: Sfx, volume = 1): void {
    const ctx = this.ctx;
    if (ctx === null || ctx.state !== 'running') {
      return;
    }
    const t = ctx.currentTime;
    const v = Math.max(0.0002, Math.min(1, volume));
    switch (name) {
      case 'snap':
        this.tone(2400, t, 0.03, 0.09, 'square', 1200);
        this.tone(900, t + 0.035, 0.06, 0.07, 'triangle', 600);
        return;
      case 'chirp':
        /* A little fantail-like song: a few bright notes, rising and falling. */
        for (let i = 0; i < 4; i += 1) {
          const f = [2600, 3100, 2800, 3400][i];
          this.tone(f, t + i * 0.11, 0.08, 0.05 * v, 'sine', f * (i % 2 === 0 ? 1.18 : 0.86));
        }
        return;
      case 'croak':
        this.tone(140, t, 0.16, 0.08 * v, 'sawtooth', 110);
        this.tone(150, t + 0.2, 0.14, 0.07 * v, 'sawtooth', 115);
        return;
      default:
        break;
    }
    switch (name) {
      case 'tap':
        this.tone(640, t, 0.05, 0.1, 'triangle');
        break;
      case 'switch':
        this.tone(420, t, 0.07, 0.11, 'triangle', 700);
        break;
      case 'ok':
        this.tone(520, t, 0.08, 0.12, 'triangle');
        this.tone(780, t + 0.07, 0.12, 0.12, 'triangle');
        break;
      case 'deny':
        this.tone(190, t, 0.13, 0.13, 'square');
        break;
      case 'step':
        this.tone(160, t, 0.05, 0.04, 'triangle');
        break;
      case 'done':
        this.tone(523, t, 0.1, 0.14, 'triangle');
        this.tone(659, t + 0.1, 0.1, 0.14, 'triangle');
        this.tone(784, t + 0.2, 0.22, 0.14, 'triangle');
        break;
      case 'scan':
        this.tone(900, t, 0.18, 0.07, 'sine', 1500);
        this.tone(1500, t + 0.16, 0.12, 0.06, 'sine');
        break;
      case 'pickup':
        this.tone(330, t, 0.1, 0.13, 'triangle', 520);
        break;
      case 'drop':
        this.tone(420, t, 0.1, 0.13, 'triangle', 220);
        break;
      case 'stretch':
        this.tone(180, t, 0.4, 0.13, 'sawtooth', 620);
        break;
      case 'note1':
        this.tone(440, t, 0.4, 0.16, 'sine');
        break;
      case 'note2':
        this.tone(554, t, 0.4, 0.16, 'sine');
        break;
      case 'note3':
        this.tone(659, t, 0.4, 0.16, 'sine');
        break;
      case 'flag':
        this.tone(740, t, 0.08, 0.09, 'triangle');
        break;
      case 'hornbill':
        for (let i = 0; i < 3; i += 1) {
          this.tone(330, t + i * 0.42, 0.26, 0.17, 'sawtooth', 210);
          this.tone(660, t + i * 0.42, 0.16, 0.05, 'square', 420);
        }
        break;
      case 'star':
        this.tone(780, t, 0.1, 0.14, 'triangle');
        this.tone(1170, t + 0.09, 0.18, 0.14, 'triangle');
        break;
      case 'whoosh':
        this.tone(260, t, 0.35, 0.08, 'sine', 900);
        break;
      default:
        break;
    }
  }

  /** The disturbance: a droning generator, until someone deals with it. */
  setHum(level: number): void {
    const ctx = this.ctx;
    if (ctx === null || this.master === null) {
      return;
    }
    if (this.hum === null && level > 0) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 68;
      gain.gain.value = 0;
      osc.connect(gain).connect(this.master);
      osc.start();
      this.hum = { gain, osc };
    }
    if (this.hum !== null) {
      this.hum.gain.gain.setTargetAtTime(level * 0.06, ctx.currentTime, 0.1);
    }
  }
}
