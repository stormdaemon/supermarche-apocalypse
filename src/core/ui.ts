import './ui.css';

export type UiSlot =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'center';

/** DOM layer drawn above the canvas. Features place their widgets in named slots. */
export class Ui {
  readonly root: HTMLDivElement;
  private readonly slots = new Map<UiSlot | 'fullscreen', HTMLDivElement>();

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'ui-root';
    parent.append(this.root);
    const names: (UiSlot | 'fullscreen')[] = [
      'top-left',
      'top-center',
      'top-right',
      'bottom-left',
      'bottom-center',
      'bottom-right',
      'center',
      'fullscreen',
    ];
    for (const name of names) {
      const slot = document.createElement('div');
      slot.className = `ui-slot ui-${name}`;
      this.root.append(slot);
      this.slots.set(name, slot);
    }
  }

  /** Returns the container of a slot. 'fullscreen' covers the whole screen (menus). */
  slot(name: UiSlot | 'fullscreen'): HTMLDivElement {
    const slot = this.slots.get(name);
    if (!slot) throw new Error(`Unknown UI slot ${name}`);
    return slot;
  }

  /** Creates an element with a class and optional text inside a slot. */
  add(slot: UiSlot | 'fullscreen', className: string, text = ''): HTMLDivElement {
    const el = document.createElement('div');
    el.className = className;
    el.textContent = text;
    this.slot(slot).append(el);
    return el;
  }

  /** Shows a big cartoon message in the middle of the screen for a while. */
  toast(text: string, duration = 2.5): void {
    const el = this.add('top-center', 'ui-toast', text);
    window.setTimeout(() => el.classList.add('ui-toast-out'), duration * 1000);
    window.setTimeout(() => el.remove(), duration * 1000 + 400);
  }
}
