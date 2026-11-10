/** Parameters of a synthesized oscillator note. */
export interface ToneOptions {
  freq: number;
  /** Frequency reached at the end of the note (pitch slide). */
  endFreq?: number;
  type?: OscillatorType;
  duration?: number;
  volume?: number;
  /** Delay before the note starts, in seconds. */
  delay?: number;
}

export interface NoiseOptions {
  duration?: number;
  volume?: number;
  /** Low-pass cutoff in Hz. */
  filterFreq?: number;
  delay?: number;
}

/**
 * Web Audio engine: every sound in the game is synthesized here, no audio files.
 * The AudioContext starts on the first user gesture, as browsers require.
 */
export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private mutedState = false;

  constructor() {
    const unlock = (): void => {
      this.ensure();
      void this.context?.resume();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  get ctx(): AudioContext | null {
    return this.context;
  }

  /** Destination node that features should connect custom graphs to. */
  get output(): AudioNode | null {
    return this.master;
  }

  get muted(): boolean {
    return this.mutedState;
  }

  setMuted(muted: boolean): void {
    this.mutedState = muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.6, this.context.currentTime, 0.02);
    }
  }

  private ensure(): AudioContext | null {
    if (this.context) return this.context;
    const ctx = new AudioContext();
    this.master = ctx.createGain();
    this.master.gain.value = this.mutedState ? 0 : 0.6;
    this.master.connect(ctx.destination);
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
    this.context = ctx;
    return ctx;
  }

  tone(options: ToneOptions): void {
    const ctx = this.context;
    if (!ctx || !this.master || ctx.state !== 'running') return;
    const start = ctx.currentTime + (options.delay ?? 0);
    const duration = options.duration ?? 0.15;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = options.type ?? 'square';
    osc.frequency.setValueAtTime(options.freq, start);
    if (options.endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, options.endFreq), start + duration);
    }
    gain.gain.setValueAtTime(options.volume ?? 0.2, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  noise(options: NoiseOptions = {}): void {
    const ctx = this.context;
    if (!ctx || !this.master || !this.noiseBuffer || ctx.state !== 'running') return;
    const start = ctx.currentTime + (options.delay ?? 0);
    const duration = options.duration ?? 0.2;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = options.filterFreq ?? 2000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(options.volume ?? 0.2, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(start);
    source.stop(start + duration + 0.02);
  }
}
