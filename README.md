# Mon Plan Finance

App perso (web, installable sur iPhone, marche hors ligne) : https://oucothmane.github.io/mon-plan-finance/

Même famille que Mon Plan Santé : mêmes polices, mêmes cartes, mêmes onglets. Le vert est la couleur de la finance.

## Ce qu'elle fait

- **Budget** : le mois en cours. « Reste à dépenser » en gros, puis une saisie rapide : tu tapes le montant et tu touches le poste (courses, sorties…). « Annuler » retire la dernière saisie. Chaque poste a sa jauge, avec un trait qui marque où en est le mois : si la jauge dépasse le trait, tu dépenses plus vite que le mois n'avance. Touche un poste pour corriger son total ou le remettre à zéro. En dessous : le mois prévu (entrées, dépenses, épargne) et ta situation (patrimoine, crédit restant, matelas de sécurité).
- **Dépenses** : ton budget de base, par mois. Les dépenses sont rangées par catégorie avec leur sous-total. Les trois points d'une ligne servent à changer sa catégorie ou à la supprimer.
- **Suivi** : la répartition par catégorie et les plus gros postes en pourcentage du revenu.
- **Crédit** : crédit restant, mensualité, mois restants et fin estimée, plus une simulation « et si je rembourse plus ? ». Tu choisis une fois quelle dépense est ta mensualité.
- **Réglages** : apparence (auto, clair, sombre), sauvegarde (export, import, export CSV) et remise à zéro.

## Repères

- Les postes suivis au jour le jour sont ceux de la catégorie « Vie courante & Sorties ».
- Quand le mois change, l'app propose de remettre les compteurs à zéro. Il n'y a ni clôture ni historique.
- Les montants acceptent la virgule ou le point : 12,50 ou 12.50.
- L'estimation du crédit est simple : crédit restant divisé par la mensualité, sans les intérêts.

## Confidentialité

Les montants écrits dans le code sont des valeurs d'exemple. Tes vrais chiffres restent uniquement sur ton téléphone (localStorage) : pense à les exporter de temps en temps.

## Fichiers

- `index.html` : toute l'app (HTML, CSS, JS dans un seul fichier)
- `sw.js` : service worker (mode hors ligne)
- `manifest.json`, `icon.svg` et `*.png` : installation sur l'écran d'accueil

Pour publier une mise à jour : modifier `index.html` et augmenter le numéro de `CACHE` dans `sw.js`.
