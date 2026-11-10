import * as THREE from 'three';
import { AudioEngine } from './audio';
import { Arena } from './arena';
import { type Aim, FollowCamera } from './camera';
import { Combat } from './combat';
import { DebugOverlay } from './debug';
import { type System, World } from './ecs';
import { EnemyManager } from './enemies';
import { EventBus } from './events';
import type { Registry } from './feature';
import { Input } from './input';
import { GameLoop, GameTime } from './loop';
import { Particles } from './particles';
import { Physics } from './physics';
import { Player, type PlayerMotor } from './player';
import { PickupManager, TrapManager } from './props';
import { Ui } from './ui';
import { WeaponSystem } from './weapons';
import { AiDirector, Score, Surfaces } from './world-services';

/**
 * Owns every core service. Features receive the Game in setup() and use its services;
 * they never need to edit core files.
 */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly world = new World();
  readonly events = new EventBus();
  readonly time = new GameTime();
  readonly physics: Physics;
  readonly input: Input;
  readonly cameraRig: FollowCamera;
  readonly ui: Ui;
  readonly audio = new AudioEngine();
  readonly fx: Particles;
  readonly surfaces: Surfaces;
  readonly ai: AiDirector;
  readonly combat: Combat;
  readonly arena: Arena;
  readonly player: Player;
  readonly enemies: EnemyManager;
  readonly weapons: WeaponSystem;
  readonly traps: TrapManager;
  readonly pickups: PickupManager;
  readonly score: Score;
  readonly debug: DebugOverlay;
  /** Cursor aim, refreshed every frame. */
  readonly aim: Aim = { point: new THREE.Vector3(), direction: new THREE.Vector3(0, 0, -1) };
  /** When true the core restarts the game a few seconds after the player dies. */
  autoRestartOnDeath = true;
  motor: PlayerMotor;
  private readonly loop: GameLoop;
  private pausedState = false;
  private restartRequested = false;
  private autoRestartTimer: number | undefined;

  constructor(
    container: HTMLElement,
    readonly registry: Registry,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Only the static decor casts real shadows, so the shadow map is rendered on demand.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.append(this.renderer.domElement);

    this.physics = new Physics(this.world);
    this.input = new Input(this.renderer.domElement);
    this.cameraRig = new FollowCamera(this.physics, container.clientWidth / container.clientHeight);
    this.ui = new Ui(document.body);
    this.fx = new Particles(this.scene);
    this.surfaces = new Surfaces(this.time);
    this.ai = new AiDirector(this.time);
    this.combat = new Combat(this.physics, this.events, this.time);

    this.arena = new Arena(this);
    this.arena.build(registry.get('shelf'));
    this.player = new Player(this, this.physics, this.arena.layout.playerSpawn);
    this.world.add(this.player.entity);
    this.motor = registry.get('playerMotor')();
    this.enemies = new EnemyManager(this);
    this.weapons = new WeaponSystem(this);
    this.traps = new TrapManager(this);
    this.pickups = new PickupManager(this);
    this.score = new Score(this.events, this.time, (id) => registry.enemies.get(id)?.points ?? 10);
    this.debug = new DebugOverlay(this);

    this.events.on('death', ({ entity }) => {
      if (entity !== this.player.entity) return;
      this.events.emit('playerDeath', { position: this.player.position.clone() });
      if (this.autoRestartOnDeath) {
        this.ui.toast('K.O. ! On recommence...', 2.5);
        window.clearTimeout(this.autoRestartTimer);
        this.autoRestartTimer = window.setTimeout(() => this.restart(), 3000);
      }
    });

    this.cameraRig.snapTo(this.player.position);
    window.addEventListener('resize', () => this.resize(container));

    this.loop = new GameLoop(this.time, {
      fixedUpdate: (dt) => this.fixedUpdate(dt),
      render: (dt, alpha) => this.render(dt, alpha),
    });
  }

  /** Adds a system to the world. Feature systems should use priority >= 100. */
  addSystem(system: System): () => void {
    return this.world.addSystem(system);
  }

  get camera(): THREE.PerspectiveCamera {
    return this.cameraRig.camera;
  }

  get paused(): boolean {
    return this.pausedState;
  }

  setPaused(paused: boolean): void {
    if (paused === this.pausedState) return;
    this.pausedState = paused;
    this.loop.paused = paused;
    this.events.emit(paused ? 'pause' : 'resume', {});
  }

  /** Spawns the default content (weapons, traps) and starts the loop. */
  start(): void {
    this.debug.buildSpawnButtons();
    this.weapons.spawnDefaults();
    this.traps.spawnDefaults();
    this.loop.start();
  }

  /** Re-renders the static shadow map (call after moving shadow-casting decor). */
  invalidateShadows(): void {
    this.renderer.shadowMap.needsUpdate = true;
  }

  /**
   * Clears every runtime object and puts the player back at the entrance.
   * The restart happens at the start of the next frame, so it is safe to call from
   * any event listener or system.
   */
  restart(): void {
    this.restartRequested = true;
  }

  private performRestart(): void {
    this.restartRequested = false;
    window.clearTimeout(this.autoRestartTimer);
    this.autoRestartTimer = undefined;
    this.enemies.clear();
    this.pickups.clear();
    this.surfaces.clear();
    this.ai.clear();
    this.fx.clear();
    this.weapons.reset();
    this.traps.reset();
    this.player.respawn();
    this.motor.reset?.();
    this.score.reset();
    this.time.scale = 1;
    this.invalidateShadows();
    this.events.emit('reset', {});
    this.events.emit('playerRespawn', {});
  }

  /** Ends the run (used by menus); emits gameOver with the final score. */
  gameOver(): void {
    this.events.emit('gameOver', { score: this.score.value });
  }

  private fixedUpdate(dt: number): void {
    this.motor.fixedUpdate(this.player, this, dt);
    this.enemies.fixedUpdate(dt);
    this.weapons.fixedUpdate(dt);
    this.traps.fixedUpdate(dt);
    this.pickups.fixedUpdate();
    this.world.fixedUpdate(dt);
    this.physics.step();
    this.score.update();
    this.input.endFixedStep();
  }

  private render(frameDt: number, alpha: number): void {
    if (this.restartRequested) this.performRestart();
    const dt = this.paused || this.time.frozen ? 0 : frameDt * this.time.scale;
    this.physics.sync(alpha);
    this.player.update(dt);
    this.enemies.update(dt);
    this.weapons.update();
    this.traps.update(dt);
    this.pickups.update(dt);
    this.world.update(dt, alpha);
    this.fx.update(dt);
    this.arena.update(this.time.realElapsed);
    this.cameraRig.update(frameDt, this.player.rig.root.position);
    this.cameraRig.updateAim(this.input, this.player.position, this.player.forward(), this.aim);
    this.debug.update(frameDt);
    this.renderer.render(this.scene, this.camera);
  }

  private resize(container: HTMLElement): void {
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.cameraRig.resize(container.clientWidth / container.clientHeight);
  }
}
