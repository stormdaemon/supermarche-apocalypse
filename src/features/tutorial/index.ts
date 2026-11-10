import * as THREE from 'three';
import { BaseEnemy, DEFAULT_ENEMY_STATS } from '../../core/enemies';
import { defineFeature } from '../../core/feature';
import type { Game } from '../../core/game';
import { flatMaterial, PALETTE, pick } from '../../core/materials';
import type { Weapon } from '../../core/types';
import { TUTORIAL_CONFIG } from './config';

const C = TUTORIAL_CONFIG;
const STYLE_ID = 'tutorial-style';

/** Training dummy: a neutral target that never walks, attacks or scores. */
class TrainingDummy extends BaseEnemy {
  constructor(game: Game, position: THREE.Vector3) {
    super(
      game,
      'mannequin',
      C.texts.dummyName,
      position,
      {
        ...DEFAULT_ENEMY_STATS,
        maxHealth: C.dummy.maxHealth,
        speed: 0,
        damage: 0,
        attackRange: 0,
        attackForce: 0,
      },
      {
        skin: C.dummy.skin,
        shirt: C.dummy.shirt,
        pants: C.dummy.pants,
        shoes: C.dummy.shoes,
        hairStyle: 'none',
        accessories: [],
      },
    );
  }

  /** The goal is the dummy's own spot, so it stays where it was placed. */
  protected override think(): void {
    this.goal.copy(this.position);
    this.chasingPlayer = false;
  }

  /** Cartoon death without hit or death events, so no score is awarded. */
  retire(): void {
    if (this.state === 'dead') return;
    this.health.current = 0;
    this.health.dead = true;
    this.die({ damage: 0, force: new THREE.Vector3(0, 0, 1) });
  }
}

/** One step of the tutorial: a text, an availability test and a validation test. */
interface Goal {
  readonly text: string;
  available(): boolean;
  /** Called when the goal becomes current, and again after a reset. */
  enter(): void;
  /** Called every fixed step; returns true once the goal is validated. */
  check(dt: number): boolean;
  /** Writes the 3D position the indicator should float above; returns false for none. */
  target?(out: THREE.Vector3): boolean;
}

/** Input events that were seen while the tutorial was running (latched until reset). */
interface Flags {
  dodged: boolean;
  jumped: boolean;
  equipped: boolean;
  thrown: boolean;
}

const noop = (): void => {};

function noFlags(): Flags {
  return { dodged: false, jumped: false, equipped: false, thrown: false };
}

/** Smallest signed difference between two angles, in radians. */
function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function readDone(): boolean {
  try {
    return window.localStorage.getItem(C.storageKey) === '1';
  } catch {
    // Storage unavailable (private window, blocked site data): show the tutorial.
    return false;
  }
}

function writeDone(): void {
  try {
    window.localStorage.setItem(C.storageKey, '1');
  } catch {
    // Storage unavailable: the tutorial will show again on the next launch.
  }
}

/** Adds the tutorial's cartoon styles once per page. */
function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.ui-slot > .tuto-panel {
  pointer-events: none;
  align-items: center;
  gap: 6px;
  margin-bottom: 24px;
  padding: 12px 26px 14px;
  border-radius: 22px;
  background: rgba(20, 18, 31, 0.55);
}
.tuto-counter {
  font-size: 18px;
  font-weight: 800;
  color: #fff;
  background: #1b1b24;
  padding: 2px 14px;
  border-radius: 999px;
}
.tuto-text {
  max-width: 80vw;
  font-size: 40px;
  font-weight: 900;
  color: #ffe066;
  text-align: center;
  text-shadow:
    3px 3px 0 #1b1b24,
    -3px -3px 0 #1b1b24,
    3px -3px 0 #1b1b24,
    -3px 3px 0 #1b1b24,
    0 4px 0 #1b1b24;
}
.tuto-skip {
  pointer-events: auto;
  margin-top: 4px;
  font: inherit;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  background: #24243a;
  border: 2px solid #ffe066;
  border-radius: 999px;
  padding: 4px 14px;
  cursor: pointer;
}
.tuto-skip:hover {
  background: #3a3a5a;
}
`;
  document.head.append(style);
}

/** Guided first-launch tutorial; replayable with F1. */
class Tutorial {
  private active = false;
  /** Goals grouped by step, keeping only the goals available for this run. */
  private plan: Goal[][] = [];
  private groupIndex = 0;
  private goalIndex = 0;
  private hits = 0;
  private walked = 0;
  private turned = 0;
  private readonly lastPos = new THREE.Vector3();
  private hasLastPos = false;
  private lastAim = 0;
  private finaleTimer = 0;
  private flags: Flags = noFlags();
  private readonly dummies: TrainingDummy[] = [];
  private readonly groups: Goal[][];
  private readonly panel: HTMLDivElement;
  private readonly counter: HTMLDivElement;
  private readonly text: HTMLDivElement;
  private readonly indicator = new THREE.Group();
  private readonly tmp = new THREE.Vector3();
  private readonly spot = new THREE.Vector3();
  private clock = 0;

  constructor(private readonly game: Game) {
    this.panel = game.ui.add('bottom-center', 'tuto-panel');
    this.panel.style.display = 'none';
    this.counter = document.createElement('div');
    this.counter.className = 'tuto-counter';
    this.text = document.createElement('div');
    this.text.className = 'tuto-text';
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'tuto-skip';
    skip.textContent = C.texts.skip;
    skip.addEventListener('click', () => this.finish());
    this.panel.append(this.counter, this.text, skip);

    // Yellow cone floating above the current target; pointing down, tip at the bottom.
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(C.indicator.radius, C.indicator.length, 8),
      flatMaterial(PALETTE.yellow, 0.4),
    );
    cone.rotation.x = Math.PI;
    this.indicator.add(cone);
    this.indicator.visible = false;
    game.scene.add(this.indicator);

    this.groups = this.buildGroups();

    game.events.on('hit', ({ target }) => {
      if (this.active && this.dummies.some((dummy) => dummy.entity === target)) this.hits += 1;
    });
    game.events.on('playerDodge', () => {
      if (this.active) this.flags.dodged = true;
    });
    game.events.on('playerJump', () => {
      if (this.active) this.flags.jumped = true;
    });
    game.events.on('weaponEquip', () => {
      if (this.active) this.flags.equipped = true;
    });
    game.events.on('weaponDrop', ({ thrown }) => {
      if (this.active && thrown) this.flags.thrown = true;
    });
    game.events.on('reset', () => this.onReset());

    game.addSystem({
      name: 'tutorial',
      priority: 110,
      fixedUpdate: (dt) => this.fixedUpdate(dt),
      update: (dt) => this.updateIndicator(dt),
    });
  }

  /** Starts the tutorial from its first step (also used by F1 to replay it). */
  start(): void {
    this.retireDummies();
    this.flags = noFlags();
    this.plan = this.groups
      .map((group) => group.filter((goal) => goal.available()))
      .filter((group) => group.length > 0);
    this.groupIndex = 0;
    this.goalIndex = 0;
    this.hasLastPos = false;
    this.active = true;
    this.panel.style.display = '';
    this.enterCurrent();
  }

  private buildGroups(): Goal[][] {
    const game = this.game;
    const hasController = (): boolean => game.registry.features.includes('player-controller');
    const hasWeapons = (): boolean => game.registry.weapons.size > 0;
    return [
      [
        {
          text: C.texts.move,
          available: () => true,
          enter: () => {
            this.walked = 0;
          },
          check: () => this.walked >= C.walkDistance,
        },
      ],
      [
        {
          text: C.texts.aim,
          available: () => true,
          enter: () => {
            this.turned = 0;
            this.lastAim = Math.atan2(game.aim.direction.x, game.aim.direction.z);
          },
          check: () => this.turned >= C.aimAngle,
        },
      ],
      [
        {
          text: C.texts.dodge,
          available: hasController,
          enter: noop,
          check: () => this.flags.dodged,
        },
        {
          text: C.texts.jump,
          available: hasController,
          enter: noop,
          check: () => this.flags.jumped,
        },
      ],
      [
        {
          text: C.texts.hit,
          available: () => hasController() || hasWeapons(),
          enter: () => {
            this.hits = 0;
            this.ensureDummy();
          },
          check: () => this.hits >= C.dummyHits,
          target: (out) => this.targetDummy(out),
        },
      ],
      [
        {
          text: C.texts.equip,
          available: hasWeapons,
          enter: noop,
          check: () => this.flags.equipped || game.weapons.held !== null,
          target: (out) => this.targetWeapon(out),
        },
        {
          text: C.texts.throw,
          available: hasWeapons,
          enter: () => this.ensureDummy(),
          check: () => this.flags.thrown,
          target: (out) => this.targetDummy(out),
        },
      ],
      [
        {
          text: C.texts.finale,
          available: () => true,
          enter: () => {
            this.finaleTimer = C.finaleDuration;
            this.retireDummies();
          },
          check: (dt) => {
            this.finaleTimer -= dt;
            return this.finaleTimer <= 0;
          },
        },
      ],
    ];
  }

  private current(): Goal | undefined {
    return this.plan[this.groupIndex]?.[this.goalIndex];
  }

  private enterCurrent(): void {
    const goal = this.current();
    if (!goal) return;
    goal.enter();
    this.text.textContent = goal.text;
    this.counter.textContent = `${C.texts.counter} ${this.groupIndex + 1}/${this.plan.length}`;
  }

  private advance(dt: number): void {
    const goal = this.current();
    if (!goal || !goal.check(dt)) return;
    const group = this.plan[this.groupIndex] ?? [];
    this.goalIndex += 1;
    if (this.goalIndex < group.length) {
      this.enterCurrent();
      return;
    }
    this.groupIndex += 1;
    this.goalIndex = 0;
    if (this.groupIndex >= this.plan.length) {
      this.finish();
      return;
    }
    this.game.ui.toast(pick(C.bravoMessages), C.bravoDuration);
    this.enterCurrent();
  }

  /** Ends the tutorial, remembers it, and hides everything it added to the scene. */
  private finish(): void {
    this.active = false;
    this.retireDummies();
    this.indicator.visible = false;
    this.panel.style.display = 'none';
    writeDone();
  }

  /** Measures walking and cursor rotation, then checks the current goal. */
  private fixedUpdate(dt: number): void {
    const game = this.game;
    const p = game.player.position;
    if (this.hasLastPos) this.walked += Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z);
    this.lastPos.copy(p);
    this.hasLastPos = true;

    const aim = Math.atan2(game.aim.direction.x, game.aim.direction.z);
    this.turned += Math.abs(angleDelta(this.lastAim, aim));
    this.lastAim = aim;

    if (this.active) this.advance(dt);
  }

  /** The core already disposed the enemies and bodies on reset, so only forget them here. */
  private onReset(): void {
    this.dummies.length = 0;
    this.hasLastPos = false;
    this.flags = noFlags();
    if (!this.active) return;
    this.goalIndex = 0;
    this.enterCurrent();
  }

  private liveDummy(): TrainingDummy | undefined {
    return this.dummies.find((dummy) => dummy.entity.alive && dummy.state !== 'dead');
  }

  /** Spawns one training dummy in front of the player when none is alive. */
  private ensureDummy(): void {
    if (this.liveDummy()) return;
    const player = this.game.player;
    this.spot.copy(player.position).addScaledVector(player.forward(this.tmp), C.dummySpawnDistance);
    const enemy = this.game.enemies.spawn('mannequin', this.spot);
    if (enemy instanceof TrainingDummy) this.dummies.push(enemy);
  }

  /** Makes the dummies tumble away and forgets them. Only for dummies still in the world. */
  private retireDummies(): void {
    for (const dummy of this.dummies) {
      if (dummy.entity.alive) dummy.retire();
    }
    this.dummies.length = 0;
  }

  private targetDummy(out: THREE.Vector3): boolean {
    const dummy = this.liveDummy();
    if (!dummy) return false;
    out.copy(dummy.position);
    return true;
  }

  /** The weapon the player would pick up now, or the closest one on the floor. */
  private nearestWeapon(): Weapon | null {
    const game = this.game;
    const near = game.weapons.nearest;
    if (near) return near;
    let best: Weapon | null = null;
    let bestDistance = Infinity;
    for (const weapon of game.weapons.all) {
      weapon.object.getWorldPosition(this.spot);
      const distance = this.spot.distanceToSquared(game.player.position);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = weapon;
      }
    }
    return best;
  }

  private targetWeapon(out: THREE.Vector3): boolean {
    if (this.game.weapons.held) return false;
    const weapon = this.nearestWeapon();
    if (!weapon) return false;
    weapon.object.getWorldPosition(out);
    return true;
  }

  /** Keeps the cone above the current target, bobbing and spinning. */
  private updateIndicator(dt: number): void {
    this.clock += dt;
    const goal = this.active ? this.current() : undefined;
    if (!goal?.target?.(this.tmp)) {
      this.indicator.visible = false;
      return;
    }
    const { height, bobAmplitude, bobSpeed, spinSpeed } = C.indicator;
    this.indicator.visible = true;
    this.indicator.position.set(
      this.tmp.x,
      this.tmp.y + height + Math.sin(this.clock * bobSpeed) * bobAmplitude,
      this.tmp.z,
    );
    this.indicator.rotation.y = this.clock * spinSpeed;
  }
}

export default defineFeature({
  id: 'tutorial',
  register(registry) {
    registry.registerEnemy({
      id: 'mannequin',
      displayName: C.texts.dummyName,
      points: 0,
      create: (game, position) => new TrainingDummy(game, position),
    });
  },
  setup(game) {
    injectStyle();
    const tutorial = new Tutorial(game);
    game.input.bind('f1', 'custom:tutorial');
    game.input.onPress('custom:tutorial', () => tutorial.start());
    if (!readDone()) tutorial.start();
  },
});
