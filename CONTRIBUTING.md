# Contribuer à deux sans conflits

## Branches

- `main` est toujours jouable. Personne ne pousse directement dessus.
- Une branche par feature, partie de `main` à jour : `feat/<nom-court>` (ou `chore/<nom>` pour l'infra).
- Une feature vit uniquement dans `src/features/<nom>/`. Elle s'enregistre seule via `src/registry.ts`.
- Si une feature a besoin d'un point d'extension qui manque dans `src/core/`, on fait une PR dédiée au cœur (`feat/core-<nom>`), relue par les deux, avant la feature.

## Commits

Messages en français au format conventional commits :

- `feat: ajoute la baguette qui se casse`
- `fix: le caddie ne traverse plus les rayons`
- `chore: met à jour Vite`
- `docs: explique les providers`

Un commit = un changement cohérent.

## Pull requests

Chaque PR contient, en français :

- **Quoi** : ce que la feature apporte
- **Comment tester** : touches, ce qu'on doit voir à l'écran
- **Fichiers touchés**
- **Checklist de relecture**

Avant d'ouvrir la PR :

```bash
npm run typecheck
npm run lint
npm run build
```

Labels : `feature`, `enemy`, `weapon`, `level`, `ui`, `audio`, `juice`, `infra`.

L'autre frère relit, teste avec `npm run dev`, puis merge en squash.

## Style de code

- TypeScript strict, pas de `any`.
- Commentaires en anglais, qui décrivent ce que fait le code aujourd'hui (pas d'historique « fixed: », « added: »).
- Textes du jeu en français.
- Valeurs d'équilibrage dans le `config.ts` de chaque feature.
