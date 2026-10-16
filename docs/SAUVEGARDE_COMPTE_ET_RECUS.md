# LBT Tracker — raccordements à installer

## État au 16 octobre 2026

Le journal de séances, la matrice multi-bénéficiaires et le suivi des reçus sont implémentés côté application, sur la branche de la PR 2. Ils ne créent pas de stockage distant.

## Sauvegarde liée au compte : piste Wix existante

Le site Pose Ta Brique utilise Wix Editor, Velo et l’espace membres. Le relevé API du 16 octobre indique un quota CMS de 4 000 éléments, partagé par l’ensemble du site, et 10 Gio de stockage. Ces limites ne sont pas une garantie de capacité illimitée ou de coût futur nul.

Le raccordement nécessite :

1. Identifier la page et le composant HTML qui accueillent LBT Tracker. Déterminer s’il s’agit d’un composant affichant directement l’application ou d’une iframe imbriquée : la messagerie doit atteindre la page Wix sans transmettre les dossiers à un parent non vérifié.
2. Ajouter un module backend `.web.js` réservé aux membres. L’identité du propriétaire vient de la session Wix côté serveur ; elle ne doit jamais être prise dans un e-mail ou identifiant fourni par l’iframe.
3. Créer un stockage privé. Aucun accès public à la collection. À chaque lecture, écriture ou suppression, le backend vérifie que le propriétaire est le membre authentifié et qu’il a droit à l’application. Ne pas donner à tous les membres un accès à tous les dossiers.
4. Valider l’adéquation du stockage aux informations réellement présentes dans les dossiers (identités, profils, observations). Ne pas transférer automatiquement les dossiers actuels vers le CMS avant cette validation.
5. Relier la page Wix à l’application avec des messages à origine exacte et identifiant de requête ; ne pas utiliser `*` pour les dossiers ou les jetons. La page appelle le backend avec l’identité Wix attachée par la plateforme.
6. Ajouter des révisions côté serveur pour rejeter les écrasements lorsqu’un autre appareil a modifié un dossier. Proposer une copie de conflit, jamais un remplacement automatique.
7. Séparer les états « enregistré sur cet appareil », « en attente de synchronisation », « sauvegarde compte confirmée » et « conflit ». Un statut distant exige une réponse serveur positive portant sur la bonne révision.
8. Tester avec des données fictives et deux comptes : A ne peut lire ni modifier les dossiers de B ; déconnexion, hors-ligne, quota saturé, deux appareils, fermeture/reprise, import et suppression.

Aucune collection de dossiers, aucun compte et aucun transfert de données réelles n’a été créé dans cette intervention. Les outils Wix exposés ne permettent pas d’éditer le code d’une page Wix Editor existante : installation dans l’éditeur nécessaire.

Sources officielles consultées :
- https://dev.wix.com/docs/overview/backend-services/frontend-to-backend-communication
- https://dev.wix.com/docs/velo/velo-only-apis/$w/html-component/on-message
- https://dev.wix.com/docs/api-reference/business-solutions/cms/operations/site-data-usage/get-site-data-usage

## Transmission de recherche : contrat d’accusé de réception

L’ancien envoi utilisait `fetch` en mode `no-cors`. Une réponse opaque ne prouve pas l’écriture en base. L’application n’enregistre désormais un succès que si une réponse JSON lisible et positive porte le même `transmission_id` et un `receipt_id` non vide.

Le script Google Apps Script existant doit être adapté dans son propre projet, sans remplacer ses traitements actuels à l’aveugle :

1. Lire et valider le contenu reçu ; contrôler le consentement et le schéma attendu.
2. Dédupliquer côté serveur par `transmission_id`. Une répétition renvoie le reçu déjà émis et ne recrée pas les lignes.
3. Écrire les données dans la destination. Retourner un succès seulement après écriture terminée. Éviter qu’une erreur laisse un reçu de succès alors que seule une partie des lignes est stockée.
4. Retourner un JSON lisible depuis l’origine de l’application, sous la forme :

```json
{"ok":true,"transmission_id":"identifiant exact reçu","receipt_id":"référence persistante du serveur"}
```

5. En cas d’erreur, ne pas renvoyer `ok:true`. Le client conserve un statut non confirmé.
6. Tester le déploiement Apps Script depuis l’origine réelle de l’application ; si la réponse n’est pas lisible à cause de la configuration des redirections/CORS, installer un relais backend sur le site plutôt que rétablir un faux succès `no-cors`.

Le projet Apps Script n’est pas accessible par les connecteurs disponibles. Aucun envoi de données réelles n’a été réalisé pendant les tests. Tant que ce script ne produit pas un reçu compatible, les envois restent « réception non confirmée ». Les historiques antérieurs sans reçu sont conservés, mais exclus des contributions confirmées.
