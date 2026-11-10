# Supermarché Apocalypse

Jeu d'action solo en 3D low-poly, jouable dans le navigateur. C'est le Black Friday : tu es un vigile stagiaire coincé dans un supermarché en pleine apocalypse, et tu dois survivre aux vagues de clients enragés avec ce qui te tombe sous la main (caddie, baguette, extincteur, pack d'eau, serpillière). Tout repose sur la physique, le ton est cartoon, jamais gore.

- Vite + TypeScript strict, Three.js, Rapier (`@dimforge/rapier3d-compat`)
- Aucun asset externe : modèles générés en code (primitives, flat shading), sons synthétisés (Web Audio)

## Installation

```bash
npm install
npm run dev
```

| Commande            | Rôle                               |
| ------------------- | ---------------------------------- |
| `npm run dev`       | Serveur de dev avec rechargement   |
| `npm run build`     | Typecheck puis build de production |
| `npm run preview`   | Sert le build de production        |
| `npm run typecheck` | Vérification TypeScript            |
| `npm run lint`      | ESLint + vérification Prettier     |
| `npm run format`    | Formate tout le code avec Prettier |

## Jouer en ligne

Une version jouable est publiée sur GitHub Pages : https://stormdaemon.github.io/supermarche-apocalypse/

Le déploiement se fait automatiquement à chaque push sur `main` (workflow `.github/workflows/deploy-pages.yml`). Il faut l'activer une seule fois dans les réglages du dépôt : **Settings > Pages > Source : GitHub Actions**.

## Contrôles

| Touche                | Action                                      |
| --------------------- | ------------------------------------------- |
| ZQSD / WASD / flèches | Se déplacer                                 |
| Souris                | Viser (le joueur se tourne vers le curseur) |
| Clic gauche           | Attaquer                                    |
| Clic droit            | Lancer l'arme tenue                         |
| E                     | Ramasser / lâcher une arme                  |
| Espace                | Sauter                                      |
| Shift                 | Esquiver                                    |
| Échap / P             | Pause                                       |
| F3                    | Overlay de debug                            |

## Architecture

```
src/
  main.ts            démarrage : Rapier, registre, features, Game
  registry.ts        charge automatiquement src/features/*/index.ts (import.meta.glob)
  core/              moteur partagé : ne pas modifier depuis une PR de feature
  features/<nom>/    une feature = un dossier (index.ts + config.ts + ce qu'il faut)
```

### Cycle de vie d'une feature

Chaque feature exporte par défaut un `FeatureModule` :

```ts
import { defineFeature } from '../../core/feature';

export default defineFeature({
  id: 'weapon-baguette',
  // Avant la construction du monde : définitions et providers.
  register(registry) {
    registry.registerWeapon({
      id: 'baguette',
      displayName: 'Baguette',
      create: (game, pos) => new Baguette(game, pos),
    });
  },
  // Après la construction du monde : systèmes, UI, écoute d'événements.
  setup(game) {
    game.events.on('hit', (e) => {
      /* ... */
    });
  },
});
```

Le registre trouve le dossier tout seul : aucune ligne à ajouter ailleurs.

### Services du cœur (`game.*`)

| Service                                       | Rôle                                                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `game.scene`, `game.camera`, `game.cameraRig` | Rendu Three.js, caméra haute qui suit le joueur (`cameraRig.addTrauma()` = screen shake)                                              |
| `game.physics`                                | Monde Rapier, `createBody`, `bind` (synchro mesh ↔ corps interpolée), `raycast`, `overlapSphere`, `onContact`                         |
| `game.world`                                  | Mini ECS : `Entity`, composants (`defineComponent`), systèmes (`game.addSystem`)                                                      |
| `game.events`                                 | Bus typé : `hit`, `death`, `knockout`, `waveStart`, `waveEnd`, `pickup`, `explosion`, `weaponEquip`, `reset`… (voir `core/events.ts`) |
| `game.input`                                  | Actions logiques : `isDown('attack')`, `pressed('jump')`, `moveAxes()`, `onPress()`                                                   |
| `game.aim`                                    | Point visé au sol sous le curseur et direction depuis le joueur                                                                       |
| `game.time`                                   | Temps simulé, `scale` (ralenti), `hitstop(durée)`                                                                                     |
| `game.player`                                 | Joueur (capsule kinématique Rapier) : `velocity`, `applyImpulse`, `lockControl`, `setInvulnerable`, `rig`                             |
| `game.motor`                                  | Moteur de déplacement du joueur (remplaçable via le provider `playerMotor`)                                                           |
| `game.combat`                                 | `hit(cible, info)`, `meleeSweep(...)`, `explode(...)` : tous les dégâts passent par là                                                |
| `game.enemies`                                | `spawn(typeId, position)`, liste et nombre d'ennemis vivants                                                                          |
| `game.weapons`                                | Ramassage E, attaque clic gauche, lancer clic droit, `held`                                                                           |
| `game.traps`, `game.pickups`                  | Pièges et bonus enregistrés                                                                                                           |
| `game.surfaces`                               | Zones de sol : glissant (`control`), tapis roulant (`velocity`)                                                                       |
| `game.ai`                                     | Points d'attraction pour les ennemis (`addAttractor`) : promos, appâts                                                                |
| `game.score`                                  | Score et combos (alimentés par les morts d'ennemis)                                                                                   |
| `game.fx`                                     | Particules low-poly : `burst({ position, color, count, ... })`                                                                        |
| `game.audio`                                  | Synthé Web Audio : `tone()`, `noise()`, `setMuted()`                                                                                  |
| `game.ui`                                     | Calque DOM : `slot('top-left')`, `add()`, `toast()`                                                                                   |
| `game.arena.layout`                           | Points nommés : portes, rayons, caisses, spots d'armes et de pièges                                                                   |

Autres points d'extension :

- Événements propres à une feature : augmenter l'interface `GameEvents` dans le dossier de la feature (`declare module '../../core/events' { interface GameEvents { monEvent: {...} } }`).
- Touches supplémentaires : `game.input.bind('r', 'custom:respawn')` puis `game.input.pressed('custom:respawn')`.
- Poser un ennemi librement (ragdoll, prise de catch) : `enemy.visualOverride = true` ; l'événement `recover` signale qu'il se relève.
- Toucher des props au corps à corps : `meleeSweep({ ..., extraMask: Groups.PROP })`.
- Redémarrer : `game.restart()` est différé à l'image suivante, donc sans danger depuis un listener. Les features qui créent leurs propres corps (rayons dynamiques…) les recréent sur l'événement `reset`.
- Décor qui bouge et projette une ombre : appeler `game.invalidateShadows()` (la shadow map n'est recalculée qu'à la demande).

Providers remplaçables (le plus prioritaire gagne) : `playerMotor` (déplacement du joueur) et `shelf` (construction d'un rayon).

### Ajouter un ennemi

1. Créer `src/features/enemy-<nom>/config.ts` avec ses valeurs (PV, vitesse, dégâts…).
2. Dans `index.ts`, étendre `BaseEnemy` (`core/enemies.ts`) avec un look de `createCharacter` (`core/characterFactory.ts`). Surcharger `think()` ou `performAttack()` pour un comportement spécial.
3. L'enregistrer dans `register()` avec `registry.registerEnemy({ id, displayName, points, create })`.
4. Tester : `npm run dev`, F3, bouton de l'ennemi dans la liste « Ennemis ».

### Ajouter une arme

1. Créer `src/features/weapon-<nom>/config.ts`.
2. Étendre `BaseWeapon` (`core/weapons.ts`) : fournir le mesh (primitives), les colliders, `holdOffset`, et implémenter `attack(ctx)` (par exemple avec `game.combat.meleeSweep`).
3. L'enregistrer avec `registry.registerWeapon({ id, displayName, create })`. Elle apparaît toute seule sur un spot d'arme de l'arène, et dans F3.

## Règles

- Une PR de feature ne touche que `src/features/<nom>/` (et éventuellement `docs/`).
- Les valeurs d'équilibrage vivent dans le `config.ts` de la feature.
- Pas de `any`, aucune erreur console, 60 FPS visés avec 30 ennemis.
- Voir [CONTRIBUTING.md](CONTRIBUTING.md).
