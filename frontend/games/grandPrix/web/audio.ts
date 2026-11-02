/**
 * Synthesised sound for the Grand Prix (no files): effects, an engine hum
 * that follows Navie's speed, and a racing music loop - with master, music
 * and effects volumes. Created on the first tap (browser audio policy),
 * suspended on pause and when the app is hidden.
 */

export type RaceSfx =
  | 'box'
  | 'roll'
  | 'itemUse'
  | 'spin'
  | 'shieldBlock'
  | 'incoming'
  | 'count'
  | 'go'
  | 'turbo'
  | 'boost'
  | 'pad'
  | 'bolt'
  | 'bump'
  | 'wall'
  | 'lap'
  | 'finalLap'
  | 'finish'
  | 'up'
  | 'tap'
  | 'deny'
  | 'buy'
  | 'trophy';

export class RaceAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineSub: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private volumes = { master: 0.8, music: 0.5, effects: 0.8 };
  private timer: ReturnType<typeof setInterval> | null = null;
  private playing = false;
  private nextBeat = 0;
  private beat = 0;
  private suspended = false;

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
      this.master.connect(ctx.destination);
      this.music = ctx.createGain();
      this.effects = ctx.createGain();
      this.music.connect(this.master);
      this.effects.connect(this.master);
      const length = Math.floor(ctx.sampleRate * 0.4);
      this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }
      this.applyVolumes();
      if (this.playing) {
        this.startMusic();
      }
    }
    if (!this.suspended && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }
  }

  setVolumes(v: { master: number; music: number; effects: number }): void {
    this.volumes = { ...v };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (this.ctx === null) {
      return;
    }
    const now = this.ctx.currentTime;
    this.master!.gain.setTargetAtTime(this.volumes.master, now, 0.02);
    this.music!.gain.setTargetAtTime(this.volumes.music * 0.3, now, 0.02);
    this.effects!.gain.setTargetAtTime(this.volumes.effects, now, 0.02);
  }

  suspend(): void {
    this.suspended = true;
    this.setEngine(0, false);
    if (this.ctx !== null && this.ctx.state === 'running') {
      void this.ctx.suspend().catch(() => undefined);
    }
  }

  resume(): void {
    this.suspended = false;
    if (this.ctx !== null && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }
  }

  dispose(): void {
    this.stopEngine();
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.ctx !== null) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
    }
  }

  private tone(freq: number, duration: number, wave: OscillatorType, gain: number, when = 0, dest: GainNode | null = this.effects, slideTo?: number): void {
    const ctx = this.ctx;
    if (ctx === null || dest === null || this.suspended) {
      return;
    }
    const start = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), start + duration);
    }
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.012, duration / 4));
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(env);
    env.connect(dest);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  private hiss(duration: number, gain: number, filter: number, when = 0): void {
    const ctx = this.ctx;
    if (ctx === null || this.noise === null || this.effects === null || this.suspended) {
      return;
    }
    const start = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, start);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    src.connect(f);
    f.connect(env);
    env.connect(this.effects);
    src.start(start);
    src.stop(start + duration + 0.02);
  }

  sfx(name: RaceSfx): void {
    if (this.ctx === null) {
      return;
    }
    switch (name) {
      case 'box':
        [880, 1175, 1568].forEach((f, i) => this.tone(f, 0.07, 'square', 0.05, i * 0.045));
        break;
      case 'roll':
        this.tone(1320, 0.05, 'triangle', 0.08);
        this.tone(1760, 0.09, 'triangle', 0.08, 0.06);
        break;
      case 'itemUse':
        this.tone(520, 0.14, 'sine', 0.09, 0, this.effects, 1040);
        break;
      case 'spin':
        this.hiss(0.35, 0.35, 1400);
        this.tone(700, 0.45, 'sawtooth', 0.05, 0, this.effects, 180);
        break;
      case 'shieldBlock':
        this.tone(1200, 0.18, 'sine', 0.09, 0, this.effects, 600);
        break;
      case 'incoming':
        [988, 740, 988, 740].forEach((f, i) => this.tone(f, 0.09, 'square', 0.05, i * 0.11));
        break;
      case 'count':
        this.tone(440, 0.22, 'square', 0.07);
        break;
      case 'go':
        this.tone(880, 0.45, 'square', 0.08);
        break;
      case 'turbo':
        this.tone(700, 0.08, 'triangle', 0.1);
        this.tone(1050, 0.12, 'triangle', 0.1, 0.06);
        break;
      case 'boost':
        this.hiss(0.6, 0.3, 2400);
        this.tone(200, 0.6, 'sawtooth', 0.06, 0, this.effects, 600);
        break;
      case 'pad':
        this.tone(600, 0.25, 'sine', 0.1, 0, this.effects, 1400);
        break;
      case 'bolt':
        this.tone(1320, 0.06, 'square', 0.04);
        this.tone(1760, 0.08, 'square', 0.035, 0.05);
        break;
      case 'bump':
        this.hiss(0.12, 0.3, 800);
        this.tone(120, 0.12, 'square', 0.06, 0, this.effects, 70);
        break;
      case 'wall':
        this.hiss(0.2, 0.4, 600);
        break;
      case 'lap':
        [660, 880].forEach((f, i) => this.tone(f, 0.15, 'triangle', 0.1, i * 0.09));
        break;
      case 'finalLap':
        [660, 880, 1100].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.11, i * 0.1));
        break;
      case 'finish':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.12, i * 0.12));
        break;
      case 'up':
        this.tone(780, 0.1, 'sine', 0.06, 0, this.effects, 1170);
        break;
      case 'tap':
        this.tone(880, 0.035, 'sine', 0.05);
        break;
      case 'deny':
        this.tone(200, 0.09, 'square', 0.05);
        break;
      case 'buy':
        [660, 880, 1320].forEach((f, i) => this.tone(f, 0.12, 'square', 0.05, i * 0.06));
        break;
      case 'trophy':
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.12, i * 0.14));
        break;
    }
  }

  /** The engine: pitch follows speed, a little brighter while boosting; 0 turns it off. */
  setEngine(speed: number, boosting: boolean): void {
    const ctx = this.ctx;
    if (ctx === null || this.effects === null) {
      return;
    }
    if (speed <= 0.01 || this.suspended) {
      this.stopEngine();
      return;
    }
    if (this.engineOsc === null) {
      this.engineOsc = ctx.createOscillator();
      this.engineSub = ctx.createOscillator();
      this.engineFilter = ctx.createBiquadFilter();
      this.engineGain = ctx.createGain();
      this.engineOsc.type = 'sawtooth';
      this.engineSub.type = 'square';
      this.engineFilter.type = 'lowpass';
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineFilter);
      this.engineSub.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.effects);
      this.engineOsc.start();
      this.engineSub.start();
    }
    const now = ctx.currentTime;
    const f = 55 + speed * 3.4 + (boosting ? 25 : 0);
    this.engineOsc.frequency.setTargetAtTime(f, now, 0.08);
    this.engineSub!.frequency.setTargetAtTime(f / 2, now, 0.08);
    this.engineFilter!.frequency.setTargetAtTime(500 + speed * 25 + (boosting ? 600 : 0), now, 0.1);
    this.engineGain!.gain.setTargetAtTime(0.035, now, 0.1);
  }

  private stopEngine(): void {
    if (this.engineOsc !== null) {
      try {
        this.engineOsc.stop();
        this.engineSub?.stop();
      } catch {
        // Already stopped.
      }
      this.engineOsc.disconnect();
      this.engineSub?.disconnect();
      this.engineGain?.disconnect();
      this.engineOsc = null;
      this.engineSub = null;
      this.engineGain = null;
      this.engineFilter = null;
    }
  }

  // -- music --------------------------------------------------------------------

  playMusic(on: boolean): void {
    this.playing = on;
    if (!on) {
      if (this.timer !== null) {
        clearInterval(this.timer);
        this.timer = null;
      }
      return;
    }
    this.startMusic();
  }

  private startMusic(): void {
    if (this.ctx === null || this.timer !== null) {
      return;
    }
    this.nextBeat = this.ctx.currentTime + 0.1;
    this.beat = 0;
    this.timer = setInterval(() => this.schedule(), 120);
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (ctx === null || this.music === null || this.suspended) {
      return;
    }
    const chords = [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]];
    const eighth = 60 / 128 / 2;
    while (this.nextBeat < ctx.currentTime + 0.4) {
      const when = this.nextBeat - ctx.currentTime;
      const chord = chords[Math.floor(this.beat / 8) % chords.length];
      const step = this.beat % 8;
      const note = (s: number): number => 261.63 * 2 ** (s / 12);
      if (step % 2 === 0) {
        this.tone(note(chord[0] - 12), eighth * 1.8, 'triangle', 0.2, when, this.music);
      }
      this.tone(note(chord[[0, 1, 2, 1, 2, 1, 0, 2][step]] + 12), eighth * 0.8, 'square', 0.04, when, this.music);
      this.nextBeat += eighth;
      this.beat += 1;
    }
  }
}
