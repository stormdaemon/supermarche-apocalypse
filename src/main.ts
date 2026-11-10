import { registerCoreContent } from './core/content';
import { Registry } from './core/feature';
import { Game } from './core/game';
import { Physics } from './core/physics';
import { loadFeatures } from './registry';

async function boot(): Promise<void> {
  const container = document.querySelector<HTMLElement>('#app');
  if (!container) throw new Error('#app container missing');

  await Physics.init();

  const registry = new Registry();
  registerCoreContent(registry);
  const features = loadFeatures();
  for (const feature of features) {
    registry.features.push(feature.id);
    feature.register?.(registry);
  }

  const game = new Game(container, registry);
  for (const feature of features) feature.setup?.(game);
  game.start();
  // Exposes the game in the dev console for debugging.
  if (import.meta.env.DEV) Object.assign(window, { game });
}

void boot();
