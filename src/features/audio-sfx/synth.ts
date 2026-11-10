import { AUDIO_SFX_CONFIG as C, type ShoutSyllable } from './config';

/** Random pitch ratio in [1 - jitter, 1 + jitter]. */
function randomPitch(jitter: number): number {
  return 1 + (Math.random() * 2 - 1) * jitter;
}

/**
 * Cartoon sound effects built from Web Audio nodes connected to the game's master output.
 * Each method schedules one sound starting at `start` (AudioContext time); the nodes stop
 * and get garbage collected on their own.
 */
export class Synth {
  private noise: AudioBuffer | null = null;

  constructor(
    readonly ctx: AudioContext,
    private readonly out: AudioNode,
  ) {}

  /** BOING: a sine that sweeps up fast, then falls back down. */
  boing(start: number): void {
    const b = C.impact.boing;
    const pitch = randomPitch(C.pitchJitter);
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(b.freq * pitch, start);
    osc.frequency.exponentialRampToValueAtTime(b.peakFreq * pitch, start + b.duration * 0.25);
    osc.frequency.exponentialRampToValueAtTime(b.endFreq * pitch, start + b.duration);
    osc.connect(this.envelope(start, b.volume, 0.01, b.duration));
    this.play(osc, start, b.duration);
  }

  /** PAF: a short low-passed noise burst over a falling thump. */
  paf(start: number): void {
    const p = C.impact.paf;
    const pitch = randomPitch(C.pitchJitter);
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = p.noiseFilter * pitch;
    noise.connect(filter).connect(this.envelope(start, p.volume, 0.004, p.duration));
    this.play(noise, start, p.duration);

    const thump = this.ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(p.thumpFrom * pitch, start);
    thump.frequency.exponentialRampToValueAtTime(p.thumpTo * pitch, start + p.thumpDuration);
    thump.connect(this.envelope(start, p.volume, 0.003, p.thumpDuration));
    this.play(thump, start, p.thumpDuration);
  }

  /** POUET: squeaky horn, a sawtooth with a slight vibrato and a soft low-pass. */
  pouet(start: number): void {
    const p = C.impact.pouet;
    const pitch = randomPitch(C.pitchJitter);
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(p.freq * pitch, start);
    osc.frequency.exponentialRampToValueAtTime(p.endFreq * pitch, start + p.duration);

    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = p.vibratoRate;
    const lfoDepth = this.ctx.createGain();
    lfoDepth.gain.value = p.vibratoDepth;
    lfo.connect(lfoDepth).connect(osc.frequency);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = p.filter;
    osc.connect(filter).connect(this.envelope(start, p.volume, 0.01, p.duration));
    this.play(lfo, start, p.duration);
    this.play(osc, start, p.duration);
  }

  /** Checkout beep: two short high square tones. */
  beep(start: number): void {
    const c = C.checkout;
    this.tone(start, 'square', c.firstFreq, c.firstFreq, c.firstDuration, c.volume);
    this.tone(
      start + c.firstDuration,
      'square',
      c.secondFreq,
      c.secondFreq,
      c.secondDuration,
      c.volume,
    );
  }

  /** Shopping cart: periodic squeak of a wheel plus a burst of metal rattle clicks. */
  caddie(start: number): void {
    const s = C.caddie.squeak;
    const r = C.caddie.rattle;
    const pitch = randomPitch(C.pitchJitter);
    for (let i = 0; i < s.chirps; i++) {
      this.tone(
        start + i * s.spacing,
        'triangle',
        s.fromFreq * pitch,
        s.toFreq * pitch,
        s.chirpDuration,
        s.volume,
      );
    }
    for (let i = 0; i < r.clicks; i++) {
      this.click(start + Math.random() * r.duration, r.volume, r.filter, r.clickDuration);
    }
  }

  /** Crowd shout: each syllable is a sawtooth glide shaped by a moving vowel filter. */
  shout(start: number, syllables: readonly ShoutSyllable[]): void {
    const pitch = randomPitch(C.crowd.pitchJitter);
    let t = start;
    for (const syllable of syllables) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(syllable.fromFreq * pitch, t);
      osc.frequency.exponentialRampToValueAtTime(syllable.toFreq * pitch, t + syllable.duration);

      const formant = this.ctx.createBiquadFilter();
      formant.type = 'bandpass';
      formant.Q.value = C.crowd.formantQ;
      formant.frequency.setValueAtTime(syllable.formant * pitch, t);
      formant.frequency.exponentialRampToValueAtTime(
        syllable.formant * pitch * 0.7,
        t + syllable.duration,
      );

      osc.connect(formant).connect(this.envelope(t, C.crowd.volume, 0.03, syllable.duration));
      this.play(osc, t, syllable.duration);
      t += syllable.duration + C.crowd.syllableGap;
    }
  }

  /** Announcement jingle: ding then dong, two sine notes. */
  jingle(start: number): void {
    for (const note of C.jingle.notes) {
      this.tone(start + note.delay, 'sine', note.freq, note.freq, note.duration, C.jingle.volume);
    }
  }

  /** One oscillator note, optionally gliding from `from` to `to`. */
  private tone(
    start: number,
    type: OscillatorType,
    from: number,
    to: number,
    duration: number,
    volume: number,
  ): void {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, start + duration);
    osc.connect(this.envelope(start, volume, 0.005, duration));
    this.play(osc, start, duration);
  }

  /** Very short band-passed noise click. */
  private click(start: number, volume: number, filterFreq: number, duration: number): void {
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 2;
    source.connect(filter).connect(this.envelope(start, volume, 0.002, duration));
    this.play(source, start, duration);
  }

  /** Gain node with an attack and exponential decay, already routed to the output. */
  private envelope(start: number, peak: number, attack: number, duration: number): GainNode {
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    gain.connect(this.out);
    return gain;
  }

  private play(source: AudioScheduledSourceNode, start: number, duration: number): void {
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  /** One second of white noise, created once per audio context. */
  private noiseBuffer(): AudioBuffer {
    if (!this.noise) {
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buffer;
    }
    return this.noise;
  }
}
