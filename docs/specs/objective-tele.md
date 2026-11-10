# Objectif : protéger la dernière télé

Le but du jeu devient : protéger la dernière télé géante du magasin. Une télé plate énorme, posée sur un meuble d'exposition au centre de l'arène, avec une étiquette rouge « -90 % » au-dessus et un libellé flottant « Dernière télé : -90 % ». Les clients sont attirés par elle, et l'un d'eux peut la voler.

Code dans `src/features/objective-tele/` (index.ts, config.ts, models.ts). Aucune modification du cœur.

## Ce que le joueur voit

- **Au départ** : la télé repose sur son meuble, au milieu de l'allée centrale. Un point d'attraction permanent fait venir les clients vers elle.
- **Le vol** : un client (pas le vigile, pas la caissière) qui arrive à côté du meuble attrape la télé. Une alerte à l'écran dit « IL PART AVEC LA TÉLÉ !! Tape-le ! » et une flèche rouge « VOLEUR ! » flotte au-dessus du voleur. La télé est portée au-dessus de sa tête.
- **La course** : le voleur court vers la porte de sortie la plus proche, plus lentement qu'un client normal.
- **Riposte** : si le joueur touche le voleur, s'il est assommé ou s'il meurt, il lâche la télé. Elle tombe à côté de lui, reste au sol quelques secondes, puis revient en volant sur son meuble avec des étincelles.
- **Fin de partie** : si le voleur atteint la porte avec la télé, « La télé est partie... » s'affiche, puis la partie se termine et le ticket de caisse (menus) s'affiche avec le score.
- **Redémarrage** : la télé revient sur son meuble, plus de voleur, le point d'attraction est remis.

## Règles et équilibrage

Toutes les valeurs sont dans `config.ts` (`TELE_CONFIG`).

| Paramètre              | Valeur            | Rôle                                                                        |
| ---------------------- | ----------------- | --------------------------------------------------------------------------- |
| `attractor.pull`       | 0.35              | Probabilité qu'un client choisisse la télé plutôt que le joueur             |
| `grab.radius`          | 2.6 m             | Distance du centre du meuble à partir de laquelle un client attrape la télé |
| `grab.excludedTypeIds` | vigile, caissiere | Ceux qui ne volent jamais la télé                                           |
| `carry.speed`          | 1.5 m/s           | Vitesse du voleur (un client normal court à 3.5 m/s)                        |
| `drop.delay`           | 2 s               | Temps au sol avant le retour de la télé                                     |
| `flight.duration`      | 1 s               | Durée du vol de retour                                                      |
| `exit.radius`          | 1.6 m             | Distance de la porte à partir de laquelle la fuite est réussie              |
| `exit.endingDelay`     | 2.5 s             | Délai entre la fuite et le ticket de fin                                    |

Le point d'attraction est ajouté une fois au démarrage, avec une durée infinie. Comme il est ajouté avant les promos, la télé est le premier point testé par le directeur de l'IA.

## Comment le vol est implémenté

Le voleur reste un ennemi normal (`BaseEnemy`), sans sous-classe ni modification du cœur.

1. **Détection** : à chaque pas de physique, la feature regarde si un ennemi actif, qui n'est pas dans la liste d'exclusion, est à moins de `grab.radius` du centre du meuble. Un seul voleur à la fois.
2. **Prise de contrôle visuelle** : la feature met `enemy.visualOverride = true`. Le moteur de l'ennemi ne tourne plus son rig ni n'anime ses membres. La feature oriente le rig vers sa direction de course, l'anime avec `rig.animate` et lève les bras.
3. **Pilotage** : la feature s'exécute avec la priorité 150, donc après l'IA de l'ennemi dans le pas de physique. À chaque pas, elle impose la vélocité horizontale du voleur vers la porte (`setLinvel`), en gardant la vitesse verticale pour la gravité. L'IA de l'ennemi est donc écrasée pour le déplacement. Ses attaques restent actives : si le joueur est à portée, le voleur peut quand même frapper.
4. **Position de la télé** : la télé est posée à chaque image au-dessus de la tête du voleur, en lisant la position de son rig (interpolée par le moteur).
5. **Lâcher** : sur l'événement `hit` dont la cible est le voleur, sur `knockout` ou sur `death`, la feature rend la main (`visualOverride = false`). La télé tombe en accélérant jusqu'au sol, à 1.4 m du voleur et dans les murs.
6. **Fuite** : quand le voleur est à moins de `exit.radius` de la porte visée, il s'arrête, l'alerte « La télé est partie... » s'affiche, puis `game.gameOver()` est appelé après `exit.endingDelay`. Le score est transmis par le cœur, et le menu affiche le ticket. Pendant ce délai, les coups ne font plus lâcher la télé.

## Événements et cycle de vie

- `hit`, `death`, `knockout` : lâcher la télé si la cible est le voleur.
- `reset` : télé sur son meuble, voleur oublié, marqueur caché, point d'attraction remis.
- Tous les temps (chute, attente au sol, vol de retour, délai de fin) sont en temps simulé : ils s'arrêtent en pause et pendant le hitstop.

## Textes en jeu

- Alerte : « IL PART AVEC LA TÉLÉ !! Tape-le ! »
- Marqueur : « VOLEUR ! »
- Fuite : « La télé est partie... »
- Retour : « La télé est revenue ! »
- Étiquette : « Dernière télé : -90 % » (prix : « -90 % »)

## Fichiers

- `src/features/objective-tele/index.ts` : contrôleur (phases, vol, chute, retour, fin).
- `src/features/objective-tele/models.ts` : meuble, télé, flèche du voleur.
- `src/features/objective-tele/config.ts` : valeurs d'équilibrage et textes.
