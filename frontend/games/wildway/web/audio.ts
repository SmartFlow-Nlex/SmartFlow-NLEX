/**
 * All sound is synthesised, so every effect is original and the page needs no files:
 * a forest soundscape of air, leaves and small bird calls, restrained music, and clear
 * interaction sounds. Created on the first tap, suspended when paused or hidden.
 */

export type Sfx = 'tap' | 'switch' | 'ok' | 'deny' | 'step' | 'done' | 'scan' | 'pickup' | 'drop' | 'stretch' | 'note1' | 'note2' | 'note3' | 'flag' | 'hornbill' | 'star' | 'whoosh' | 'hum';

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

  setRegion(region: 'forest' | 'station' | 'none'): void {
    this.region = region;
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

  play(name: Sfx): void {
    const ctx = this.ctx;
    if (ctx === null || ctx.state !== 'running') {
      return;
    }
    const t = ctx.currentTime;
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
