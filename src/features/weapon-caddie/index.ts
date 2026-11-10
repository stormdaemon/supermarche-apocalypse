import { defineFeature } from '../../core/feature';
import { CaddieWeapon } from './caddie';

export default defineFeature({
  id: 'weapon-caddie',
  register(registry) {
    registry.registerWeapon({
      id: 'caddie',
      displayName: 'Caddie',
      create: (game, position) => new CaddieWeapon(game, position),
    });
  },
});
