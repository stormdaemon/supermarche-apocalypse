import type { FeatureModule } from './core/feature';

/**
 * Every folder in src/features/ exposing an index.ts with a default FeatureModule export
 * is picked up here automatically. Adding a feature never requires editing this file.
 */
const modules = import.meta.glob<{ default: FeatureModule }>('./features/*/index.ts', {
  eager: true,
});

export function loadFeatures(): FeatureModule[] {
  return Object.values(modules)
    .map((module) => module.default)
    .sort((a, b) => a.id.localeCompare(b.id));
}
