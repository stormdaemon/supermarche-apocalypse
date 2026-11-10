# Contribuer

- Une branche par feature : `feat/<nom-court>`, partie de `main` à jour.
- Une feature ne touche que son dossier `src/features/<nom>/` (et son `config.ts`).
- Commits en français au format conventional commits (`feat:`, `fix:`, `chore:`).
- Pas de push direct sur `main` : tout passe par une PR relue par l'autre frère.
- Avant d'ouvrir une PR : `npm run typecheck && npm run lint && npm run build`.
