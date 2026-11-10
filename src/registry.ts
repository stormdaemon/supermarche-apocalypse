/** Feature modules auto-loaded from src/features/<name>/index.ts. */
export interface FeatureModule {
  id: string;
  setup(): void;
}

const modules = import.meta.glob<{ default: FeatureModule }>('./features/*/index.ts', {
  eager: true,
});

export const features: FeatureModule[] = Object.values(modules).map((m) => m.default);
