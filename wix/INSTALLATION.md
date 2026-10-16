# Raccordement des sauvegardes LBT à Wix

## Installation

1. Garder le composant HTML `#html1` sur l'URL `https://cschmidtdhonneur.github.io/Echelle-LEGOTherapie/`.
2. Garder `LBT_Dossiers_Test` avec accès direct administrateur uniquement, y compris les droits collaborateurs désactivés. Champs : `memberId` Texte, `dossierId` Texte, `payload` Objet, `revision` Nombre.
3. Remplacer entièrement `backend/lbtDossiers.web.js` par le fichier voisin de même nom.
4. Remplacer le code de la page LBT Tracker par `page-LBT-Tracker.js`. Il remplace le test automatique précédent.
5. Sauvegarder et publier Wix. Tester sur le site publié, connecté comme membre, pas en aperçu.

## Test de réception, uniquement avec des données fictives

- Sur la page publiée, ouvrir « Sauvegarde compte Wix » en bas à droite.
- Ouvrir un dossier fictif, puis « Sauvegarder le dossier ouvert sur mon compte » et confirmer.
- Attendre « Enregistré et relu sur votre compte ». Fermer le panneau.
- Modifier une note et cliquer sur « Enregistrer » : pour ce dossier activé dans cette session, une nouvelle version doit être confirmée sur le compte. Les sauvegardes automatiques restent locales.
- Sur un autre navigateur connecté au même compte, utiliser « Retrouver mes versions sauvegardées », puis « Récupérer une copie ». Vérifier la note et les cotations.
- Sur un second compte, vérifier que la liste est vide. Une tentative de lecture d'un identifiant du premier compte doit échouer côté serveur.
- Tester un réseau coupé et une modification concurrente depuis deux navigateurs : jamais de confirmation erronée, jamais de remplacement de la version existante.
- Après fermeture/rechargement de l'application, réactiver explicitement le dossier avec le bouton du panneau. Rien n'est transféré au chargement.

## Comportement et limites

Chaque sauvegarde manuelle est une version immuable. Une révision concurrente bloque la copie et conserve la saisie locale. Récupérer une version ancienne permet de créer une branche indépendante, sans remplacer une version récente. Les versions se listent par pages de 50 avec un bouton pour les suivantes ; aucune troncature silencieuse.

L'accès serveur utilise exclusivement le membre authentifié et vérifie le compte attendu à chaque appel. Le composant est lié à `#html1` ; l'application vérifie l'origine et la fenêtre parent. Aucune adresse mail ou identité proposée par l'application ne remplace l'identité authentifiée.

Le stockage reste sur la collection de test. La collecte des données de recherche est indépendante. Les quotas du site Wix s'appliquent : 4 000 éléments partagés avec le reste du site au moment du contrôle, une version consomme un élément. Aucun nettoyage automatique ni suppression distante n'est réalisé ; une suppression locale conserve les versions distantes. Prévoir la gestion de rétention avant une ouverture générale.

Les tests automatisés utilisent des simulations Node des API Wix et de la messagerie. Ils ne remplacent pas le test sur Wix publié, la vérification des autorisations réelles de la collection ni la validation des conditions d'hébergement pour les données des bénéficiaires. Ne pas importer de dossiers réels durant cette recette.
