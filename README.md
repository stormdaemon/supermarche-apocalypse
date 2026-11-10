# Supermarché Apocalypse

Jeu d'action solo en 3D low-poly dans le navigateur : c'est le Black Friday, survis aux vagues de clients enragés avec un caddie, une baguette ou un extincteur.

Stack : Vite, TypeScript strict, Three.js et Rapier. Aucun asset externe.

## Commandes

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run typecheck`
- `npm run lint`

## Architecture

Chaque feature vit dans `src/features/<nom>/` et est chargée automatiquement par `src/registry.ts` via `import.meta.glob`. Les specs de chaque PR sont dans `docs/specs/`.
