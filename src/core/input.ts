/** Logical actions the game reads, independent of the physical keys. */
export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'jump'
  | 'dodge'
  | 'interact'
  | 'attack'
  | 'throw'
  | 'pause'
  | 'debug';

// ZQSD (AZERTY) and WASD (QWERTY) are both mapped by the produced character.
const KEY_BINDINGS: Record<string, Action> = {
  z: 'forward',
  w: 'forward',
  arrowup: 'forward',
  s: 'back',
  arrowdown: 'back',
  q: 'left',
  a: 'left',
  arrowleft: 'left',
  d: 'right',
  arrowright: 'right',
  ' ': 'jump',
  shift: 'dodge',
  e: 'interact',
  escape: 'pause',
  p: 'pause',
  f3: 'debug',
};

const MOUSE_BINDINGS: Record<number, Action> = { 0: 'attack', 2: 'throw' };

/**
 * Keyboard and mouse state. Edge-triggered "pressed" actions persist until the next
 * fixed step consumes them so that no press is lost between physics ticks.
 */
export class Input {
  private readonly down = new Set<Action>();
  private readonly pressedQueue = new Set<Action>();
  private readonly pressedFrame = new Set<Action>();
  private readonly listeners = new Map<Action, Set<() => void>>();
  /** Mouse movement accumulated since the last camera read. */
  mouseDelta = { x: 0, y: 0 };
  pointerLocked = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      const action = KEY_BINDINGS[e.key.toLowerCase()];
      if (!action) return;
      if (action === 'debug' || action === 'jump') e.preventDefault();
      if (!e.repeat) this.press(action);
    });
    window.addEventListener('keyup', (e) => {
      const action = KEY_BINDINGS[e.key.toLowerCase()];
      if (action) this.down.delete(action);
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.pointerLocked) {
        void canvas.requestPointerLock();
        return;
      }
      const action = MOUSE_BINDINGS[e.button];
      if (action) this.press(action);
    });
    window.addEventListener('mouseup', (e) => {
      const action = MOUSE_BINDINGS[e.button];
      if (action) this.down.delete(action);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.mouseDelta.x += e.movementX;
      this.mouseDelta.y += e.movementY;
    });
    window.addEventListener('blur', () => this.down.clear());
  }

  private press(action: Action): void {
    this.down.add(action);
    this.pressedQueue.add(action);
    this.pressedFrame.add(action);
    this.listeners.get(action)?.forEach((cb) => cb());
  }

  /** True while the action is held. */
  isDown(action: Action): boolean {
    return this.down.has(action);
  }

  /** True during the first fixed step after the action was pressed. */
  pressed(action: Action): boolean {
    return this.pressedQueue.has(action);
  }

  /** True during the first rendered frame after the action was pressed. */
  pressedThisFrame(action: Action): boolean {
    return this.pressedFrame.has(action);
  }

  /** Runs a callback immediately on press, even while the game is paused. */
  onPress(action: Action, cb: () => void): () => void {
    let set = this.listeners.get(action);
    if (!set) {
      set = new Set();
      this.listeners.set(action, set);
    }
    set.add(cb);
    return () => set.delete(cb);
  }

  /** Movement axes in [-1, 1]: x = strafe right, y = forward. */
  moveAxes(): { x: number; y: number } {
    const x = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
    const y = (this.isDown('forward') ? 1 : 0) - (this.isDown('back') ? 1 : 0);
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  }

  consumeMouseDelta(): { x: number; y: number } {
    const delta = { ...this.mouseDelta };
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
    return delta;
  }

  endFixedStep(): void {
    this.pressedQueue.clear();
  }

  endFrame(): void {
    this.pressedFrame.clear();
  }

  releasePointer(): void {
    if (this.pointerLocked) document.exitPointerLock();
  }
}
