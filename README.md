# Mon Plan Finance

App perso minimaliste (web, installable sur iPhone, marche hors ligne) : https://oucothmane.github.io/mon-plan-finance/

Même famille que Mon Plan Santé : mêmes polices, mêmes cartes, mêmes onglets. Le vert est la couleur de la finance.

## Parcours en 4 onglets

1. **Dépenses** *(Ce mois)* :
   - **Reste à dépenser ce mois** en grand, avec le budget par jour restant (`~X € / jour`).
   - **Ajout en 1 geste** : tape le montant, une note facultative si tu veux, et touche le poste (*Courses*, *Sorties*…).
   - **Jauges par poste** : touche un poste pour corriger son total ou le remettre à zéro.
   - **Historique du mois** (replié en bas) : liste tes dépenses saisies avec suppression en un clic.

2. **Budget** *(Mon mois type)* :
   - **Résumé direct** : `Entrées − Sorties = Balance` (objectif : balance toujours à `0 €`).
   - **Dépenses du quotidien** : les postes suivis au jour le jour dans l'onglet *Dépenses*.
   - **Charges fixes** : loyer, **épargne fixe**, factures, abonnements…
   - **Revenus** : salaire, primes…

3. **Épargne** :
   - **Épargne fixe prévue chaque mois** : calculée depuis ta ligne *Épargne* dans les *Charges fixes*, avec le reste du mois non dépensé et la projection sur 1 an.
   - **Mon patrimoine** : le total que tu as de côté, un bouton pour transférer directement le **reste du mois** vers ton patrimoine (pour garder la balance à `0 €`), un bouton pour ajouter ton **épargne fixe** du mois, et ton matelas de sécurité.

4. **Réglages** :
   - Apparence (Auto, Clair, Sombre), sauvegarde (Exporter / Importer) et remise à zéro.

## Fichiers

- `index.html` : structure HTML des 4 onglets
- `styles.css` : design minimaliste clair/sombre
- `app.js` : logique de l'application
- `sw.js` : service worker (mode hors ligne)
