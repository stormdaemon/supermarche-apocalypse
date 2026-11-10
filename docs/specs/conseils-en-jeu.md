# Petits conseils en jouant

## But

Montrer au bon moment, dans une bulle discrète en bas de l'écran, un petit conseil qui aide le joueur : ce qu'il doit protéger, quelle touche utiliser, quelle arme prendre ou lancer. Un seul conseil à la fois, jamais de spam.

## Affichage

- Une bulle de style dessin animé apparaît en bas au centre (calque `bottom-center`), avec une petite queue pointant vers le bas.
- Elle disparaît toute seule après `displaySeconds` (4,5 s).
- Entre la fin d'un conseil et le suivant, un délai global `cooldownSeconds` (6 s) s'écoule.
- Un conseil ne s'affiche qu'une fois tant que sa condition reste vraie : il revient seulement après que la condition a été relâchée.
- Quand plusieurs conseils sont éligibles, le premier de la liste d'ordre de priorité est choisi (esquive, puis débuts de partie, puis le reste).

## Conseils et déclencheurs

| Conseil            | Texte                                      | Déclenchement                                                               | Affichages max |
| ------------------ | ------------------------------------------ | --------------------------------------------------------------------------- | -------------- |
| Esquive            | Attention ! Esquive avec Shift !           | PV du joueur sous 30 %                                                      | 3              |
| Objectif           | Protège la dernière télé géante !          | Début de partie (portes ouvertes), 2 s après le départ                      | 1              |
| Commandes          | ZQSD pour bouger, la souris pour viser     | Début de partie, juste après le conseil « Objectif »                        | 1              |
| Attaque            | Clic gauche pour taper !                   | Au moins un ennemi à moins de 7 m, et aucun coup encore porté par le joueur | 2              |
| Ramassage          | Appuie sur E pour prendre la baguette !    | Joueur près d'une arme (à portée du E) sans rien tenir, pendant 1,2 s       | 3              |
| Lancer             | Clic droit pour la lancer !                | Arme tenue depuis 8 s sans être lancée                                      | 2              |
| Pause entre vagues | Profite de la pause pour ramasser une arme | Fin de vague, rien en main, et au moins une arme au sol                     | 3              |

Le nom de l'arme vient du registre (`displayName`, en minuscules) ; l'article est dans `weaponArticles` de `config.ts`.

Le « début de partie » est le premier moment où le jeu tourne après l'ouverture des portes, et à chaque nouvelle partie (« Recommencer », « Rouvrir le magasin », touche R). Si le tutoriel est à l'écran à ce moment-là, les conseils de début sont reportés : dès que son panneau disparaît (terminé ou passé), le conseil « Objectif » est affiché (toujours), puis le conseil « Commandes » seulement si le tutoriel n'a pas tourné pendant cette partie.

## Quand rien ne s'affiche

- Jeu en pause (Échap / P, menu « PAUSE CAFÉ »).
- Écran titre avant « OUVRIR LES PORTES » (le jeu est en pause).
- Joueur à terre (K.O., écran de fin de partie).
- Panneau du tutoriel visible : c'est le tutoriel qui guide. Les conseils de début attendent qu'il disparaisse.

Un conseil affiché disparaît immédiatement si l'un de ces cas arrive.

## Mémorisation

- Le nombre d'affichages de chaque conseil est stocké dans `localStorage` sous la clé `supermarche-apocalypse:tips-shown` (objet JSON `{ id: nombre }`).
- Les limites de `maxShows` sont donc valables d'une session à l'autre.
- Lecture et écriture sont protégées par `try/catch` : si le stockage est indisponible, les conseils s'affichent sans mémoire.

## Signaux utilisés

Seuls des signaux génériques sont écoutés, sans importer d'autre feature :

- `hit` (un coup porté par le joueur, à mains nues ou avec une arme, n'a pas encore eu lieu pour l'attaque),
- `waveEnd` et `waveStart` (pause entre les vagues),
- `reset` (nouvelle partie),
- l'état du joueur, des armes (`game.weapons`) et des ennemis (`game.enemies`),
- la présence du panneau du tutoriel dans le DOM.

Les annonces (y compris celle de la télé volée, gérée par sa propre feature) ne déclenchent aucun conseil supplémentaire.

## Contraintes

- Toutes les valeurs (durées, seuils, distances, nombres d'affichages) et tous les textes sont dans `src/features/conseils-en-jeu/config.ts`.
- La feature vit uniquement dans `src/features/conseils-en-jeu/` et ne modifie aucun fichier du cœur.
- Les durées sont en temps simulé : elles se figent pendant la pause.
