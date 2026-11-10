import * as THREE from 'three';
import type { Game } from './game';

/**
 * F3 overlay: FPS, physics counters, collider wireframes and spawn buttons for every
 * registered enemy, weapon, trap and pickup, so each feature can be tested on its own.
 */
export class DebugOverlay {
  visible = false;
  showColliders = false;
  private readonly panel: HTMLDivElement;
  private readonly stats: HTMLPreElement;
  private readonly lines: THREE.LineSegments;
  private frames = 0;
  private fpsTimer = 0;
  private fps = 0;

  constructor(private readonly game: Game) {
    this.panel = game.ui.add('top-right', 'debug-panel');
    this.panel.style.display = 'none';
    this.stats = document.createElement('pre');
    this.stats.style.margin = '0';
    this.panel.append(this.stats);

    const toggle = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.addEventListener('change', () => (this.showColliders = checkbox.checked));
    toggle.append(checkbox, ' Afficher les colliders');
    this.panel.append(toggle);

    this.lines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ vertexColors: true }),
    );
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    game.scene.add(this.lines);

    game.input.onPress('debug', () => this.toggle());
  }

  /** Builds the spawn buttons once every feature is registered. */
  buildSpawnButtons(): void {
    const { registry } = this.game;
    const section = (
      title: string,
      ids: Iterable<[string, { displayName: string }]>,
      spawn: (id: string) => void,
    ): void => {
      const entries = [...ids];
      const h = document.createElement('h4');
      h.textContent = `${title} (${entries.length})`;
      this.panel.append(h);
      for (const [id, def] of entries) {
        const button = document.createElement('button');
        button.textContent = def.displayName;
        button.title = id;
        button.addEventListener('click', () => spawn(id));
        this.panel.append(button);
      }
    };
    const front = (distance: number): THREE.Vector3 =>
      this.game.player.position.clone().addScaledVector(this.game.aim.direction, distance);
    section('Ennemis', registry.enemies, (id) => this.game.enemies.spawn(id, front(5).setY(0.2)));
    section('Armes', registry.weapons, (id) => this.game.weapons.spawn(id, front(2).setY(1.5)));
    section('Pièges', registry.traps, (id) => this.game.traps.spawn(id, front(4), 0));
    section('Bonus', registry.pickups, (id) => this.game.pickups.spawn(id, front(3)));
    const h = document.createElement('h4');
    h.textContent = `Features chargées (${registry.features.length})`;
    const list = document.createElement('div');
    list.textContent = registry.features.join(', ') || 'aucune';
    const restart = document.createElement('button');
    restart.textContent = 'Recommencer la partie';
    restart.addEventListener('click', () => this.game.restart());
    this.panel.append(h, list, restart);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.panel.style.display = this.visible ? '' : 'none';
  }

  update(dt: number): void {
    this.frames++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.fps = Math.round(this.frames / this.fpsTimer);
      this.frames = 0;
      this.fpsTimer = 0;
    }
    this.lines.visible = this.visible && this.showColliders;
    if (!this.visible) return;
    const { physics, enemies, world, player } = this.game;
    const p = player.position;
    this.stats.textContent = [
      `FPS          ${this.fps}`,
      `Corps        ${physics.bodyCount}`,
      `Colliders    ${physics.colliderCount}`,
      `Entités      ${world.entities.size}`,
      `Ennemis      ${enemies.count}`,
      `Joueur       ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}`,
      `PV           ${Math.ceil(player.health.current)}/${player.health.max}`,
    ].join('\n');
    if (this.lines.visible) {
      const buffers = physics.world.debugRender();
      const geometry = this.lines.geometry;
      geometry.setAttribute('position', new THREE.BufferAttribute(buffers.vertices, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(buffers.colors, 4));
    }
  }
}
