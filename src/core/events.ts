import type * as THREE from 'three';
import type { Entity } from './ecs';

/** Payloads of every event that travels on the game bus. */
export interface GameEvents {
  hit: {
    target: Entity;
    source: Entity | null;
    damage: number;
    force: THREE.Vector3;
    point: THREE.Vector3;
    kind: string;
  };
  death: { entity: Entity; killer: Entity | null; position: THREE.Vector3 };
  knockout: { entity: Entity; duration: number };
  waveStart: { wave: number; enemyCount: number };
  waveEnd: { wave: number };
  pickup: { itemId: string; by: Entity };
  weaponEquip: { weaponId: string };
  weaponDrop: { weaponId: string; thrown: boolean };
  weaponBreak: { weaponId: string; position: THREE.Vector3 };
  explosion: { position: THREE.Vector3; radius: number; force: number };
  enemySpawn: { entity: Entity; typeId: string };
  announcement: { text: string; duration: number; position: THREE.Vector3 | null };
  scoreChange: { score: number; delta: number; combo: number };
  playerDeath: { position: THREE.Vector3 };
  playerRespawn: Record<string, never>;
  pause: Record<string, never>;
  resume: Record<string, never>;
  /** Fired by game.restart(): every feature must clear its runtime state. */
  reset: Record<string, never>;
  gameOver: { score: number };
}

export type GameEventName = keyof GameEvents;
type Handler<K extends GameEventName> = (payload: GameEvents[K]) => void;

/** Minimal typed publish/subscribe bus. */
export class EventBus {
  private readonly handlers = new Map<GameEventName, Set<Handler<GameEventName>>>();

  on<K extends GameEventName>(name: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(handler as Handler<GameEventName>);
    return () => this.off(name, handler);
  }

  once<K extends GameEventName>(name: K, handler: Handler<K>): () => void {
    const off = this.on(name, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off<K extends GameEventName>(name: K, handler: Handler<K>): void {
    this.handlers.get(name)?.delete(handler as Handler<GameEventName>);
  }

  emit<K extends GameEventName>(name: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const handler of [...set]) (handler as Handler<K>)(payload);
  }
}
