import { defineFeature } from '../../core/feature';
import { Caissiere } from './caissiere';
import { BOSS_CONFIG, CAISSIERE_NAME, VIGILE_NAME } from './config';
import { createRuntime } from './runtime';
import { VigileBoss } from './vigile';
import './boss.css';

/**
 * Mini-boss feature: Mohamed Le Mur (vigile) and the caissières he calls on his walkie-talkie.
 * The boss walks in after a short delay, once per run, and is removed by the reset event.
 */
export default defineFeature({
  id: 'boss-vigile',
  register(registry) {
    registry.registerEnemy({
      id: 'vigile',
      displayName: VIGILE_NAME,
      points: BOSS_CONFIG.vigile.points,
      create: (game, position) => new VigileBoss(game, position),
    });
    registry.registerEnemy({
      id: 'caissiere',
      displayName: CAISSIERE_NAME,
      points: BOSS_CONFIG.caissiere.points,
      create: (game, position) => new Caissiere(game, position),
    });
  },
  setup(game) {
    const runtime = createRuntime(game);
    game.addSystem({
      name: 'boss-vigile',
      priority: 150,
      fixedUpdate: (dt) => runtime.fixedUpdate(dt),
    });
    game.events.on('reset', () => runtime.clear());
  },
});
