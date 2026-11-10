# Tutoriel joueur au premier lancement

## But

Apprendre au joueur les contrôles de base dès le premier lancement, sans quitter le jeu : déplacement, visée, actions optionnelles, attaque, armes, puis le lancement de la partie.

## Déclenchement

- Au premier lancement, le tutoriel démarre seul. Le fait qu'il soit terminé (ou passé) est mémorisé dans `localStorage` sous la clé `supermarche-apocalypse:tutorial-done`.
- Si le stockage est indisponible (fenêtre privée, données bloquées), le tutoriel s'affiche quand même.
- F1 le relance depuis le début à tout moment.
- Le bouton « Passer le tuto » arrête le tutoriel et le mémorise comme terminé.

## Étapes

| Étape | Consigne                                     | Validée quand                                                                      |
| ----- | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1     | Bouge avec ZQSD (ou WASD)                    | le joueur a parcouru 4 m                                                           |
| 2     | Vise avec la souris                          | l'angle de visée cumulé dépasse 3 rad                                              |
| 3     | Shift : plongeon ! / Espace : saute          | événements `playerDodge` puis `playerJump` (étape sautée sans `player-controller`) |
| 4     | Frappe le mannequin (clic gauche)            | 3 coups `hit` sur le mannequin (sautée sans `player-controller` ni arme)           |
| 5     | E : ramasse une arme / Clic droit : lance-la | `weaponEquip` puis `weaponDrop` avec `thrown` (sautée sans arme)                   |
| 6     | Prêt ! Les clients arrivent...               | fin : les mannequins partent, le panneau se masque                                 |

Entre deux étapes, un toast de bravo s'affiche. Une flèche jaune qui flotte et tourne désigne la cible en cours (mannequin ou arme la plus proche).

## Contraintes

- Le mannequin est un ennemi enregistré (`mannequin`, 0 point) : il ne bouge pas, n'attaque pas et a beaucoup de PV.
- Les seuils, textes et couleurs sont dans `src/features/tutorial/config.ts`.
- Au `reset`, le tutoriel reprend l'étape en cours depuis son début ; les mannequins sont recréés si besoin.
- La feature ne modifie aucun fichier du cœur et fonctionne seule sur `main`.
