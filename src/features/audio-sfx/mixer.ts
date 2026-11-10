/**
 * Rate limiter for synthesized sounds. Each channel has a minimum delay between two
 * sounds, and the total number of sounds alive is capped, so that 30 enemies hitting
 * at once cannot flood the audio thread.
 */
export class Mixer {
  /** Audio-clock time at which each booked voice ends. */
  private readonly busyUntil: number[] = [];
  /** Audio-clock time before which a channel may not play again. */
  private readonly nextAllowed = new Map<string, number>();

  constructor(private readonly maxVoices: number) {}

  /**
   * Books a voice for a sound starting at `now`. Returns false when the channel is still
   * cooling down or when every voice is busy: the sound must then be skipped.
   */
  request(channel: string, now: number, cooldown: number, duration: number): boolean {
    if ((this.nextAllowed.get(channel) ?? 0) > now) return false;
    for (let i = this.busyUntil.length - 1; i >= 0; i--) {
      if (this.busyUntil[i] <= now) this.busyUntil.splice(i, 1);
    }
    if (this.busyUntil.length >= this.maxVoices) return false;
    this.busyUntil.push(now + duration);
    this.nextAllowed.set(channel, now + cooldown);
    return true;
  }
}
