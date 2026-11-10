import type { Ui } from '../../core/ui';

/** Dedicated health bar of the boss: his name and a red life gauge, shown at the top of the screen. */
export class BossHealthBar {
  private readonly root: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private shownPercent = -1;

  constructor(ui: Ui, name: string) {
    this.root = ui.add('top-center', 'boss-vigile-bar');
    const label = document.createElement('div');
    label.className = 'boss-vigile-name';
    label.textContent = name;
    const track = document.createElement('div');
    track.className = 'boss-vigile-track';
    this.fill = document.createElement('div');
    this.fill.className = 'boss-vigile-fill';
    track.append(this.fill);
    this.root.append(label, track);
  }

  /** Updates the gauge from a health ratio in [0, 1]; only touches the DOM when the value changes. */
  setRatio(ratio: number): void {
    const clamped = Math.min(1, Math.max(0, ratio));
    const percent = Math.round(clamped * 1000) / 10;
    if (percent === this.shownPercent) return;
    this.shownPercent = percent;
    this.fill.style.width = `${percent}%`;
  }

  /** Removes the bar from the page. Safe to call more than once. */
  remove(): void {
    this.root.remove();
  }
}
