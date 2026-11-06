/**
 * Synthesised sound (no files): short effects only, no music. Created on the first
 * tap (browser audio policy), suspended on pause and when the app is hidden.
 */

export type Sfx = 'tap' | 'pick' | 'drop' | 'deny' | 'open' | 'close' | 'block' | 'clear' | 'engines' | 'star' | 'alarm' | 'rush' | 'perk' | 'wave' | 'warn' | 'tick' | 'reward' | 'repair' | 'win';

interface Note {
  f: number;
  to?: number;
  at: number;
  len: number;
  gain: number;
  type?: OscillatorType;
}

const SOUNDS: Record<Sfx, Note[]> = {
  tap: [{ f: 620, at: 0, len: 0.05, gain: 0.12, type: 'triangle' }],
  pick: [{ f: 420, to: 620, at: 0, len: 0.08, gain: 0.14, type: 'triangle' }],
  drop: [{ f: 620, to: 340, at: 0, len: 0.1, gain: 0.16, type: 'triangle' }],
  deny: [{ f: 170, at: 0, len: 0.13, gain: 0.16, type: 'square' }],
  open: [
    { f: 520, at: 0, len: 0.09, gain: 0.14, type: 'triangle' },
    { f: 780, at: 0.08, len: 0.12, gain: 0.14, type: 'triangle' },
  ],
  close: [
    { f: 620, at: 0, len: 0.08, gain: 0.12, type: 'triangle' },
    { f: 400, at: 0.07, len: 0.1, gain: 0.12, type: 'triangle' },
  ],
  block: [
    { f: 880, at: 0, len: 0.1, gain: 0.13, type: 'square' },
    { f: 660, at: 0.13, len: 0.14, gain: 0.13, type: 'square' },
  ],
  clear: [
    { f: 660, at: 0, len: 0.08, gain: 0.14, type: 'triangle' },
    { f: 880, at: 0.07, len: 0.08, gain: 0.14, type: 'triangle' },
    { f: 1180, at: 0.14, len: 0.14, gain: 0.14, type: 'triangle' },
  ],
  engines: [{ f: 320, to: 70, at: 0, len: 0.5, gain: 0.2, type: 'sawtooth' }],
  star: [
    { f: 780, at: 0, len: 0.1, gain: 0.16, type: 'triangle' },
    { f: 1170, at: 0.09, len: 0.18, gain: 0.16, type: 'triangle' },
  ],
  alarm: [
    { f: 440, to: 300, at: 0, len: 0.3, gain: 0.16, type: 'sawtooth' },
    { f: 440, to: 300, at: 0.34, len: 0.3, gain: 0.16, type: 'sawtooth' },
  ],
  rush: [
    { f: 392, at: 0, len: 0.1, gain: 0.14, type: 'triangle' },
    { f: 523, at: 0.11, len: 0.1, gain: 0.14, type: 'triangle' },
    { f: 659, at: 0.22, len: 0.16, gain: 0.14, type: 'triangle' },
  ],
  perk: [
    { f: 523, at: 0, len: 0.08, gain: 0.14, type: 'triangle' },
    { f: 784, at: 0.08, len: 0.16, gain: 0.14, type: 'triangle' },
  ],
  wave: [
    { f: 440, at: 0, len: 0.09, gain: 0.15, type: 'square' },
    { f: 660, at: 0.1, len: 0.09, gain: 0.15, type: 'square' },
    { f: 880, at: 0.2, len: 0.2, gain: 0.15, type: 'square' },
  ],
  warn: [
    { f: 740, at: 0, len: 0.12, gain: 0.14, type: 'square' },
    { f: 740, at: 0.2, len: 0.12, gain: 0.14, type: 'square' },
  ],
  tick: [{ f: 980, at: 0, len: 0.06, gain: 0.16, type: 'square' }],
  reward: [
    { f: 880, at: 0.03, len: 0.08, gain: 0.12, type: 'triangle' },
    { f: 1320, at: 0.1, len: 0.14, gain: 0.12, type: 'triangle' },
  ],
  repair: [
    { f: 300, at: 0, len: 0.06, gain: 0.14, type: 'square' },
    { f: 360, at: 0.09, len: 0.06, gain: 0.14, type: 'square' },
    { f: 300, at: 0.18, len: 0.06, gain: 0.14, type: 'square' },
  ],
  win: [
    { f: 523, at: 0.9, len: 0.12, gain: 0.16, type: 'triangle' },
    { f: 659, at: 1.02, len: 0.12, gain: 0.16, type: 'triangle' },
    { f: 784, at: 1.14, len: 0.12, gain: 0.16, type: 'triangle' },
    { f: 1047, at: 1.26, len: 0.3, gain: 0.18, type: 'triangle' },
  ],
};

export class GameAudio {
  private ctx: AudioContext | null = null;
  private enabled = true;

  /** Call from a tap. */
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
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  suspend(): void {
    if (this.ctx !== null && this.ctx.state === 'running') {
      void this.ctx.suspend().catch(() => undefined);
    }
  }

  play(name: Sfx): void {
    const ctx = this.ctx;
    if (!this.enabled || ctx === null || ctx.state !== 'running') {
      return;
    }
    const now = ctx.currentTime;
    for (const n of SOUNDS[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n.type ?? 'sine';
      osc.frequency.setValueAtTime(n.f, now + n.at);
      if (n.to !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(n.to, now + n.at + n.len);
      }
      gain.gain.setValueAtTime(0.0001, now + n.at);
      gain.gain.exponentialRampToValueAtTime(n.gain, now + n.at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.at + n.len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + n.at);
      osc.stop(now + n.at + n.len + 0.02);
    }
  }
}
