import * as THREE from 'three';
import { BaseEnemy, DEFAULT_ENEMY_STATS } from './enemies';
import type { Registry } from './feature';
import { PALETTE, pick } from './materials';
import { DefaultPlayerMotor } from './player';
import { staticShelfBuilder } from './arena';
import type { Game } from './game';

const SHOPPER_NAMES = [
  'Client pressé',
  'Chasseur de promo',
  'Monsieur Soldes',
  'Madame -70%',
  'Gérard Caddiche',
  'Josiane Bonplan',
  'Le Râleur',
  'Fan de PQ',
  'Tonton Coupon',
  'Mamie Ticket',
  'Kévin Déstockage',
  'Sylvie Fidélité',
];

/** The generic angry shopper shipped with the core so every feature has someone to hit. */
class Shopper extends BaseEnemy {
  constructor(game: Game, position: THREE.Vector3) {
    super(game, 'client', pick(SHOPPER_NAMES), position, DEFAULT_ENEMY_STATS, {
      shirt: pick([PALETTE.green, PALETTE.purple, PALETTE.orange, PALETTE.cyan, PALETTE.pink]),
      pants: pick([PALETTE.darkGrey, PALETTE.blue, PALETTE.brown]),
      hairStyle: pick(['short', 'long', 'bun', 'none'] as const),
      accessories: Math.random() < 0.3 ? ['glasses'] : [],
    });
  }
}

/** Registers the defaults every feature can override or build upon. */
export function registerCoreContent(registry: Registry): void {
  registry.provide('playerMotor', () => new DefaultPlayerMotor(), 0);
  registry.provide('shelf', staticShelfBuilder, 0);
  registry.registerEnemy({
    id: 'client',
    displayName: 'Client enragé',
    points: 10,
    create: (game, position) => new Shopper(game, position),
  });
}
