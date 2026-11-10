import { defineFeature } from '../../core/feature';
import type { Game } from '../../core/game';
import { DestructibleShelves } from './shelf';

/** One controller per game: the arena builds the shelves before the feature setup runs. */
const controllers = new WeakMap<Game, DestructibleShelves>();

function controllerFor(game: Game): DestructibleShelves {
  let controller = controllers.get(game);
  if (!controller) {
    controller = new DestructibleShelves(game);
    controllers.set(game, controller);
  }
  return controller;
}

/**
 * Replaces the static shelves with heavy dynamic ones. Big impacts make a shelf sway, then
 * it may tip over, drop its products and crush the enemies below. Shelves are put back
 * upright at each wave start and reset.
 */
export default defineFeature({
  id: 'destructible-rayons',
  register(registry) {
    // Priority 10 beats the core default (0).
    registry.provide('shelf', (game, spec) => controllerFor(game).addShelf(spec), 10);
  },
  setup(game) {
    controllerFor(game).attach();
  },
});
