import type { CharacterId, SidekickId } from '../core/types';

/**
 * All sound is synthesised with Web Audio - no files to load. Four volumes
 * (master, music, effects, voices) as separate gain nodes. The context is
 * created only after the first tap or key (browser audio policy) and is
 * suspended whenever the game pauses or the app goes to the background.
 */

export type Sfx =
  | 'bolt'
  | 'wrench'
  | 'postcard'
  | 'part'
  | 'spark'
  | 'hit'
  | 'bump'
  | 'shield'
  | 'block'
  | 'repair'
  | 'pulse'
  | 'gear'
  | 'clank'
  | 'honk'
  | 'count'
  | 'go'
  | 'win'
  | 'fail'
  | 'tap'
  | 'signal'
  | 'deny'
  | 'buy'
  | 'cough';

export type MusicMood = 'garage' | 'drive' | 'boss' | 'none';

const VOICE: Record<CharacterId | SidekickId, { base: number; wave: OscillatorType; speed: number; wobble: number }> = {
  navie: { base: 620, wave: 'sine', speed: 0.065, wobble: 0.14 },
  jepoy: { base: 250, wave: 'square', speed: 0.075, wobble: 0.1 },
  kiko: { base: 760, wave: 'triangle', speed: 0.055, wobble: 0.2 },
  barrikada: { base: 140, wave: 'sawtooth', speed: 0.085, wobble: 0.02 },
  prinsipe: { base: 190, wave: 'sawtooth', speed: 0.075, wobble: 0.04 },
  reyna: { base: 110, wave: 'sawtooth', speed: 0.095, wobble: 0.03 },
  radio: { base: 420, wave: 'square', speed: 0.06, wobble: 0.08 },
  // Sidekicks: small, quick voices.
  pip: { base: 980, wave: 'square', speed: 0.045, wobble: 0.18 },
  bumbo: { base: 330, wave: 'square', speed: 0.06, wobble: 0.12 },
  mila: { base: 880, wave: 'sine', speed: 0.05, wobble: 0.22 },
  kumpuni: { base: 520, wave: 'triangle', speed: 0.05, wobble: 0.1 },
  bantay: { base: 200, wave: 'sawtooth', speed: 0.065, wobble: 0.06 },
  silip: { base: 1150, wave: 'sine', speed: 0.04, wobble: 0.3 },
  walis: { base: 700, wave: 'triangle', speed: 0.045, wobble: 0.16 },
  barya: { base: 1050, wave: 'triangle', speed: 0.04, wobble: 0.12 },
  sibat: { base: 860, wave: 'square', speed: 0.035, wobble: 0.08 },
  tala: { base: 930, wave: 'sine', speed: 0.06, wobble: 0.18 },
  ilaw: { base: 600, wave: 'square', speed: 0.05, wobble: 0.04 },
  maso: { base: 170, wave: 'square', speed: 0.08, wobble: 0.05 },
};

const MOODS: Record<Exclude<MusicMood, 'none'>, { bpm: number; chords: number[][]; bass: OscillatorType; lead: OscillatorType }> = {
  // Semitones from A3 (220 Hz).
  drive: { bpm: 112, chords: [[3, 7, 10], [10, 14, 17], [0, 3, 7], [8, 12, 15]], bass: 'triangle', lead: 'square' },
  garage: { bpm: 88, chords: [[8, 12, 15], [3, 7, 10], [5, 8, 12], [1, 5, 8]], bass: 'sine', lead: 'triangle' },
  boss: { bpm: 132, chords: [[0, 3, 7], [8, 12, 15], [10, 14, 17], [7, 11, 14]], bass: 'sawtooth', lead: 'square' },
};

const note = (semitones: number): number => 220 * 2 ** (semitones / 12);

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private voices: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volumes = { master: 0.8, music: 0.5, effects: 0.8, voices: 0.7 };
  private mood: MusicMood = 'none';
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBeat = 0;
  private beat = 0;
  private suspended = false;
  private lastPulse = 0;

  /** Call from a user gesture. Safe to call often. */
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
      this.voices = ctx.createGain();
      for (const g of [this.music, this.effects, this.voices]) {
        g.connect(this.master);
      }
      const length = Math.floor(ctx.sampleRate * 0.5);
      this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }
      this.applyVolumes();
      if (this.mood !== 'none') {
        this.startScheduler();
      }
    }
    if (!this.suspended && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }
  }

  setVolumes(v: { master: number; music: number; effects: number; voices: number }): void {
    this.volumes = { ...v };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (this.ctx === null) {
      return;
    }
    const now = this.ctx.currentTime;
    this.master!.gain.setTargetAtTime(this.volumes.master, now, 0.02);
    this.music!.gain.setTargetAtTime(this.volumes.music * 0.35, now, 0.02);
    this.effects!.gain.setTargetAtTime(this.volumes.effects, now, 0.02);
    this.voices!.gain.setTargetAtTime(this.volumes.voices * 0.6, now, 0.02);
  }

  suspend(): void {
    this.suspended = true;
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
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.ctx !== null) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
    }
  }

  // -- primitives ---------------------------------------------------------------

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

  private hiss(duration: number, gain: number, when = 0, filter = 1200, dest: GainNode | null = this.effects): void {
    const ctx = this.ctx;
    if (ctx === null || this.noise === null || dest === null || this.suspended) {
      return;
    }
    const start = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = filter;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, start);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    src.connect(lp);
    lp.connect(env);
    env.connect(dest);
    src.start(start);
    src.stop(start + duration + 0.02);
  }

  // -- effects ---------------------------------------------------------------------

  sfx(name: Sfx): void {
    if (this.ctx === null) {
      return;
    }
    switch (name) {
      case 'bolt':
        this.tone(1320, 0.07, 'square', 0.05);
        this.tone(1760, 0.09, 'square', 0.045, 0.05);
        break;
      case 'wrench':
        this.tone(660, 0.1, 'triangle', 0.12);
        this.tone(990, 0.16, 'triangle', 0.12, 0.08);
        break;
      case 'postcard':
        [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.1, i * 0.07));
        break;
      case 'part':
        this.tone(523, 0.08, 'triangle', 0.12);
        this.tone(784, 0.12, 'triangle', 0.12, 0.07);
        break;
      case 'spark':
        this.tone(1568, 0.1, 'sine', 0.12);
        this.tone(2093, 0.16, 'sine', 0.1, 0.06);
        this.hiss(0.08, 0.05, 0, 6000);
        break;
      case 'hit':
        this.hiss(0.22, 0.4, 0, 900);
        this.tone(140, 0.24, 'sawtooth', 0.14, 0, this.effects, 55);
        break;
      case 'bump':
        this.tone(240, 0.09, 'triangle', 0.1, 0, this.effects, 180);
        break;
      case 'shield':
        this.tone(440, 0.12, 'square', 0.07);
        this.tone(554, 0.12, 'square', 0.07);
        this.tone(440, 0.14, 'square', 0.07, 0.17);
        this.tone(554, 0.14, 'square', 0.07, 0.17);
        this.tone(300, 0.4, 'sine', 0.08, 0, this.effects, 900);
        break;
      case 'block':
        this.tone(620, 0.16, 'sine', 0.14, 0, this.effects, 200);
        break;
      case 'repair':
        for (let i = 0; i < 4; i += 1) {
          this.hiss(0.03, 0.18, i * 0.06, 3000);
          this.tone(900 + i * 120, 0.03, 'square', 0.03, i * 0.06);
        }
        break;
      case 'pulse': {
        // Frequent: keep it soft and never stack.
        const now = this.ctx.currentTime;
        if (now - this.lastPulse < 0.12) {
          return;
        }
        this.lastPulse = now;
        this.tone(900, 0.05, 'sine', 0.025, 0, this.effects, 1400);
        break;
      }
      case 'gear':
        this.tone(1200, 0.05, 'square', 0.05);
        this.tone(1800, 0.12, 'triangle', 0.08, 0.02);
        this.hiss(0.05, 0.1, 0, 4000);
        break;
      case 'clank':
        this.tone(180, 0.06, 'square', 0.03);
        break;
      case 'honk':
        for (const f of [392, 494, 587]) {
          this.tone(f, 0.6, 'square', 0.06);
          this.tone(f * 2, 0.6, 'sine', 0.03);
        }
        break;
      case 'count':
        this.tone(660, 0.12, 'sine', 0.14);
        break;
      case 'go':
        this.tone(990, 0.32, 'sine', 0.16);
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.13, i * 0.11));
        break;
      case 'fail':
        [392, 330, 262].forEach((f, i) => this.tone(f, 0.26, 'triangle', 0.12, i * 0.16));
        break;
      case 'tap':
        this.tone(880, 0.035, 'sine', 0.05);
        break;
      case 'signal':
        this.tone(1000, 0.025, 'square', 0.03);
        this.tone(1000, 0.025, 'square', 0.03, 0.18);
        break;
      case 'deny':
        this.tone(200, 0.09, 'square', 0.05);
        this.tone(170, 0.11, 'square', 0.05, 0.08);
        break;
      case 'buy':
        [660, 880, 1320].forEach((f, i) => this.tone(f, 0.12, 'square', 0.05, i * 0.06));
        break;
      case 'cough':
        // An engine sputter: three uneven pops and a puff.
        [0, 0.17, 0.41].forEach((at, i) => {
          this.tone(90 - i * 12, 0.08, 'sawtooth', 0.09, at, this.effects, 50);
          this.hiss(0.1, 0.12, at, 700);
        });
        break;
    }
  }

  /** A short babble in the character's voice for a line of text (optional, "voices" volume). */
  voice(speaker: CharacterId | SidekickId, text: string): void {
    if (this.ctx === null || this.volumes.voices <= 0.001) {
      return;
    }
    const v = VOICE[speaker];
    let seed = 0;
    for (let i = 0; i < text.length; i += 1) {
      seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
    }
    const syllables = Math.min(10, Math.max(2, Math.ceil(text.length / 6)));
    for (let i = 0; i < syllables; i += 1) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      const r = (seed % 1000) / 1000;
      const f = v.base * (1 + (r - 0.5) * 2 * v.wobble) * (i === syllables - 1 && text.trim().endsWith('?') ? 1.25 : 1);
      this.tone(f, v.speed * 0.9, v.wave, speaker === 'jepoy' || speaker === 'barrikada' ? 0.05 : 0.08, i * v.speed, this.voices);
    }
  }

  // -- music -------------------------------------------------------------------------

  playMusic(mood: MusicMood): void {
    if (mood === this.mood) {
      return;
    }
    this.mood = mood;
    if (mood === 'none') {
      if (this.timer !== null) {
        clearInterval(this.timer);
        this.timer = null;
      }
      return;
    }
    this.startScheduler();
  }

  private startScheduler(): void {
    if (this.ctx === null) {
      return;
    }
    this.nextBeat = this.ctx.currentTime + 0.1;
    this.beat = 0;
    if (this.timer === null) {
      this.timer = setInterval(() => this.schedule(), 120);
    }
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (ctx === null || this.mood === 'none' || this.suspended || this.music === null) {
      return;
    }
    const m = MOODS[this.mood];
    const eighth = 60 / m.bpm / 2;
    while (this.nextBeat < ctx.currentTime + 0.4) {
      const when = this.nextBeat - ctx.currentTime;
      const bar = Math.floor(this.beat / 8) % m.chords.length;
      const chord = m.chords[bar];
      const step = this.beat % 8;
      if (step % 4 === 0) {
        this.tone(note(chord[0] - 12), eighth * 3.6, m.bass, 0.22, when, this.music);
      }
      const arp = chord[[0, 1, 2, 1, 0, 2, 1, 2][step]];
      this.tone(note(arp + 12), eighth * 0.9, m.lead, this.mood === 'garage' ? 0.06 : 0.045, when, this.music);
      if (this.mood !== 'garage' && step % 2 === 1) {
        this.hiss(0.03, 0.05, when, 7000, this.music);
      }
      this.nextBeat += eighth;
      this.beat += 1;
    }
  }
}
