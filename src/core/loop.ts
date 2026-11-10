import { CORE_CONFIG } from './config';

/** Simulation clock: fixed step, time scale (slow motion) and hitstop. */
export class GameTime {
  readonly fixedDt = 1 / CORE_CONFIG.physics.fixedHz;
  /** Simulated seconds since start (affected by scale and hitstop). */
  elapsed = 0;
  /** Real seconds since start. */
  realElapsed = 0;
  /** Simulation speed multiplier: 1 is normal, 0.3 is slow motion. */
  scale = 1;
  private freezeRemaining = 0;

  /** Freezes the simulation for a short real-time duration (seconds). */
  hitstop(duration: number): void {
    this.freezeRemaining = Math.max(this.freezeRemaining, duration);
  }

  /** Returns how many simulated seconds should elapse for the given real delta. */
  consume(realDt: number): number {
    this.realElapsed += realDt;
    if (this.freezeRemaining > 0) {
      this.freezeRemaining -= realDt;
      return 0;
    }
    return realDt * this.scale;
  }
}

export interface LoopCallbacks {
  fixedUpdate(dt: number): void;
  render(frameDt: number, alpha: number): void;
}

/** Fixed timestep loop with an accumulator and interpolated rendering. */
export class GameLoop {
  private accumulator = 0;
  private last = 0;
  private running = false;
  paused = false;

  constructor(
    private readonly time: GameTime,
    private readonly callbacks: LoopCallbacks,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    const realDt = Math.min((now - this.last) / 1000, 0.25);
    this.last = now;
    if (!this.paused) {
      this.accumulator += this.time.consume(realDt);
      let steps = 0;
      while (
        this.accumulator >= this.time.fixedDt &&
        steps < CORE_CONFIG.physics.maxStepsPerFrame
      ) {
        this.callbacks.fixedUpdate(this.time.fixedDt);
        this.time.elapsed += this.time.fixedDt;
        this.accumulator -= this.time.fixedDt;
        steps++;
      }
      if (steps === CORE_CONFIG.physics.maxStepsPerFrame) this.accumulator = 0;
    }
    this.callbacks.render(realDt, this.accumulator / this.time.fixedDt);
    requestAnimationFrame(this.frame);
  };
}
