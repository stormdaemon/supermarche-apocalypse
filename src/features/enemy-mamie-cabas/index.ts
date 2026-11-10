import * as THREE from 'three';
import { BaseEnemy, DEFAULT_ENEMY_STATS, type EnemyStats } from '../../core/enemies';
import { defineFeature, type Registry } from '../../core/feature';
import type { Game } from '../../core/game';
import type { CharacterOptions } from '../../core/characterFactory';
import { createTextSprite } from '../../core/nameTag';
import { pick } from '../../core/materials';
import type { HitInfo } from '../../core/types';
import { MAMIE_CABAS_CONFIG } from './config';

const CFG = MAMIE_CABAS_CONFIG;
const TOURNIQUET = CFG.tourniquet;

const STATS: EnemyStats = { ...DEFAULT_ENEMY_STATS, ...CFG.stats };

const LOOK: CharacterOptions = {
  shirt: CFG.look.shirt,
  pants: CFG.look.pants,
  skin: CFG.look.skin,
  hair: CFG.look.hair,
  hairStyle: CFG.look.hairStyle,
  accessories: [...CFG.look.accessories],
  accessoryColor: CFG.look.bag,
};

/**
 * Grandmother with a shopping bag. Slow and tanky, she winds up a spinning
 * tourniquet swing that hits everything around her, and says something about it.
 */
class MamieCabas extends BaseEnemy {
  /** Shared speech bubble sprites, one per line, created on first use. */
  private static readonly bubbles = new Map<string, THREE.Sprite>();

  private readonly bubble: THREE.Sprite;
  private bubbleTimer = 0;
  private spinTimer = 0;
  private spinAngle = 0;
  private readonly radial = new THREE.Vector3();

  constructor(game: Game, position: THREE.Vector3) {
    super(game, CFG.id, CFG.displayName, position, STATS, LOOK);
    this.bubble = MamieCabas.bubbleFor(CFG.tourniquet.lines[0]).clone();
    this.bubble.position.y = TOURNIQUET.bubbleHeight;
    this.bubble.visible = false;
    this.rig.parts.body.add(this.bubble);
  }

  /** Returns the shared bubble sprite for a line, creating its texture only once. */
  private static bubbleFor(line: string): THREE.Sprite {
    let sprite = MamieCabas.bubbles.get(line);
    if (!sprite) {
      sprite = createTextSprite(line, { background: '#ffffff', color: '#1b1b24' });
      MamieCabas.bubbles.set(line, sprite);
    }
    return sprite;
  }

  override fixedUpdate(dt: number): void {
    const windupBefore = this.windupTimer;
    super.fixedUpdate(dt);
    // The windup started during this step: announce the swing.
    if (windupBefore < 0 && this.windupTimer >= 0) this.startTelegraph();
  }

  /** Shows a random line and starts the spin that telegraphs the swing. */
  private startTelegraph(): void {
    const template = MamieCabas.bubbleFor(pick(TOURNIQUET.lines));
    this.bubble.material = template.material;
    this.bubble.scale.copy(template.scale);
    this.bubble.visible = true;
    this.bubbleTimer = TOURNIQUET.bubbleDuration;
    this.spinTimer = this.stats.attackWindup + TOURNIQUET.spinTail;
  }

  /** Tourniquet swing: hits the player and shoves nearby enemies when she is inside the radius. */
  protected override performAttack(): void {
    const player = this.game.player;
    const origin = this.position;
    const radius = TOURNIQUET.radius;

    this.radial.copy(player.position).sub(origin).setY(0);
    const playerDistance = this.radial.length();
    if (!player.health.dead && playerDistance <= radius) {
      this.outwardFrom(playerDistance);
      const info: HitInfo = {
        damage: this.stats.damage,
        force: this.radial
          .clone()
          .multiplyScalar(this.stats.attackForce)
          .setY(this.stats.attackForce * 0.35),
        source: this.entity,
        kind: this.typeId,
      };
      this.game.combat.hit(player, info);
    }

    for (const other of this.game.enemies.alive) {
      if (other === this || other.state === 'dead') continue;
      this.radial.copy(other.position).sub(origin).setY(0);
      const distance = this.radial.length();
      if (distance > radius) continue;
      this.outwardFrom(distance);
      // Closer enemies are shoved harder. The impulse is scaled by mass so every body gets the same speed change.
      const falloff = 1 - distance / radius;
      const impulse = this.radial
        .clone()
        .multiplyScalar(TOURNIQUET.pushSpeed * falloff * other.body.mass());
      this.game.combat.push(other.entity, impulse);
    }
  }

  /**
   * Turns the offset stored in this.radial into a horizontal unit vector, in place.
   * A zero offset falls back to the enemy's facing so the push always has a direction.
   */
  private outwardFrom(distance: number): void {
    if (distance > 0.001) this.radial.divideScalar(distance);
    else this.radial.set(Math.sin(this.facing), 0, Math.cos(this.facing));
  }

  /** Stops the spin and telegraph when the enemy is hit. */
  override applyHit(info: HitInfo): void {
    super.applyHit(info);
    this.spinTimer = 0;
  }

  /** Stops the spin and telegraph when the enemy is knocked out. */
  override knockOut(duration: number): void {
    super.knockOut(duration);
    this.spinTimer = 0;
  }

  override update(dt: number): void {
    super.update(dt);
    this.updateBubble(dt);
    this.updateSpin(dt);
  }

  private updateBubble(dt: number): void {
    if (this.bubbleTimer <= 0) return;
    this.bubbleTimer -= dt;
    if (this.bubbleTimer <= 0 || this.state === 'dead') {
      this.bubbleTimer = 0;
      this.bubble.visible = false;
    }
  }

  /** Spins the upper body with both arms held out while the swing is pending. */
  private updateSpin(dt: number): void {
    const parts = this.rig.parts;
    const spinning = this.spinTimer > 0 && this.state === 'active' && !this.visualOverride;
    if (!spinning) {
      if (this.spinTimer > 0) {
        this.spinTimer = 0;
        parts.torso.rotation.y = 0;
      }
      return;
    }
    this.spinTimer -= dt;
    this.spinAngle += dt * TOURNIQUET.spinSpeed;
    parts.torso.rotation.y = this.spinAngle;
    parts.armL.rotation.set(0, 0, -1.2);
    parts.armR.rotation.set(0, 0, 1.2);
  }
}

export default defineFeature({
  id: 'enemy-mamie-cabas',
  register(registry: Registry) {
    registry.registerEnemy({
      id: CFG.id,
      displayName: CFG.displayName,
      points: CFG.points,
      create: (game, position) => new MamieCabas(game, position),
    });
  },
});
