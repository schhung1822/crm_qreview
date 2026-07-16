# Guide d'utilisation

Ce document vous explique comment utiliser le logiciel de A à Z : de la création de votre compte, à la rédaction d'articles optimisés SEO/GEO, jusqu'à la publication de vos articles sur votre site web. Aucune connaissance technique n'est nécessaire pour suivre ce guide.

> Astuce : utilisez le champ « Rechercher dans le guide » en haut de la page pour accéder rapidement à la section dont vous avez besoin.

> Pendant l’utilisation, partout où vous voyez une icône (i), cliquez dessus pour lire une explication détaillée du champ.

---

## 1. Démarrage rapide (3 étapes)

Il suffit de 3 étapes pour rédiger votre premier article :

1. **Saisissez votre clé API d'IA** - le logiciel utilise l'IA (Claude, OpenAI, Gemini, DeepSeek) pour rédiger et évaluer. Vous devez coller la clé API d'un fournisseur dans la section **Connexions** (voir la section 3).
2. **Connectez votre site web** (pas obligatoire immédiatement) - si vous souhaitez publier vos articles directement sur WordPress, Wix, Shopify, Haravan, Sapo ou Google Sheet, ajoutez une connexion dans la section **Connexions**.
3. **Rédigez votre premier article** - allez dans l'**Éditeur**, saisissez un sujet, laissez l'IA créer un brouillon, puis retouchez-le et évaluez-le.

Sur la page **Tableau de bord** figure une liste de vérification (checklist) qui vous rappelle de terminer les étapes 1 et 2. Une fois terminée, la checklist disparaît automatiquement.

---

## 2. Les notions de base

- **Organisation (Biz)** : votre espace de travail. Tous les articles, connexions et collaborateurs appartiennent à une organisation. Vous pouvez créer plusieurs organisations et passer de l'une à l'autre grâce au sélecteur du nom de l'organisation en haut de la barre de menu de gauche.
- **Article** : un contenu que vous rédigez. Un article a le statut **Brouillon** (draft) ou **Publié** (published).
- **Score SEO / AEO / GEO** : trois indicateurs de qualité de l'article :
  - **SEO** : niveau d'optimisation pour les moteurs de recherche (Google) - titre, description, balises de titre (heading), mots-clés, liens.
  - **AEO** : niveau d'optimisation pour apparaître dans les boîtes de réponse (Answer Engine) comme Google AI Overviews.
  - **GEO** : niveau d'optimisation pour que les IA (ChatGPT, Perplexity, Gemini) citent votre article.
- **Token** : unité de mesure de la quantité de texte traitée par l'IA. Le « token entrant » correspond aux données que vous envoyez à l'IA, le « token sortant » au contenu que l'IA produit. Le coût de l'IA se calcule au token ; voir le détail dans **Rapports**.
- **Connexion** : lien vers un site web/canal pour publier des articles (WordPress, Wix, Shopify, Haravan, Sapo, Google Sheet).

---

## 3. Connexions : clé API d'IA et site web

C'est ici que vous déclarez tout ce dont le logiciel a besoin pour fonctionner. Ouvrez la section **Connexions** dans la barre de menu de gauche (groupe **Système**).

### 3.1. Ajouter une clé API d'IA

Le logiciel ne comprend pas d'IA intégrée - vous utilisez votre propre clé API, ce qui vous permet de maîtriser vos coûts et vos limites.

1. Allez dans **Connexions** → zone **Clés API d'IA**.
2. Choisissez un fournisseur : **Claude (Anthropic)**, **OpenAI**, **Gemini (Google)** ou **DeepSeek**.
3. Collez la clé API (récupérée depuis l'espace d'administration de ce fournisseur) et cliquez sur **Enregistrer**.
4. Activez l'interrupteur pour la mettre en service. Vous pouvez ajouter plusieurs fournisseurs et choisir celui à utiliser en principal.

> Astuce : si vous n'avez pas encore de clé, créez un compte chez un fournisseur d'IA, générez une clé API puis revenez la coller. La clé est stockée en toute sécurité et n'est plus affichée en entier après enregistrement.

### 3.2. Connecter un site web pour publier

1. Allez dans **Connexions** → zone **Connexions au site web** → **Ajouter une connexion**.
2. Choisissez la plateforme : **WordPress, Wix, Shopify, Haravan, Sapo**.
3. Suivez les instructions qui s'affichent directement dans la fenêtre pour chaque plateforme (saisir l'adresse du site, le compte / mot de passe d'application ou le token).
4. Cliquez sur **Tester la connexion** pour vous assurer que les informations sont correctes, puis sur **Enregistrer**.

Une fois la connexion établie, vous pouvez publier ou mettre à jour vos articles directement depuis le logiciel (voir la section 11).

---

## 4. Recherche de mots-clés

La section **Mots-clés** vous aide à trouver et regrouper des mots-clés avant de rédiger, afin que votre article corresponde aux besoins des internautes.

1. Allez dans **Mots-clés**, saisissez un mot-clé de départ (par exemple : « chaussures de running »).
2. Le logiciel suggère un ensemble de mots-clés associés, accompagnés de l'intention de recherche et des questions fréquentes (de type GEO).
3. Sélectionnez les mots-clés pertinents et enregistrez-les sous forme d'un ensemble de mots-clés à utiliser à l'étape de planification.

> Astuce : prêtez attention à la colonne d'intention (intent). Les mots-clés « acheter / prix » conviennent aux articles de vente ; les mots-clés « comment / qu'est-ce que » conviennent aux articles pratiques.

---

## 5. Planification du contenu

La section **Plan** transforme votre ensemble de mots-clés en une liste d'articles à rédiger, avec des titres et des plans suggérés.

1. Allez dans **Plan**, choisissez un ensemble de mots-clés ou saisissez un sujet.
2. Le logiciel propose des titres d'articles (title) et des plans (outline).
3. Passez-les en revue, modifiez-les, puis transférez chaque élément vers l'**Éditeur** pour la rédaction.

Cette méthode vous aide à construire des grappes de contenu (topic cluster) de façon structurée plutôt que de rédiger de manière dispersée.

---

## 6. Éditeur (rédaction d'articles)

La section **Éditeur** est l'endroit où vous rédigez et finalisez votre article.

1. Saisissez le **titre** et le **mot-clé cible**.
2. Cliquez pour que l'IA crée un **brouillon** en fonction du sujet. Vous pouvez aussi rédiger vous-même ou coller un contenu existant.
3. Utilisez les outils d'assistance :
   - **Réécrire / développer / raccourcir** un paragraphe.
   - **Humaniser (humanize)** : rendre le texte plus naturel, moins robotique.
   - **Vérification des faits (fact-check)** : contrôler les informations sujettes à erreur.
   - **Insérer une image d'illustration** : générer une image ou suggérer une image (voir la section 10).
4. Consultez les scores **SEO / AEO / GEO** mis à jour en temps réel, et suivez les suggestions pour améliorer votre score.
5. Cliquez sur **Enregistrer** - l'article rejoint la liste **Articles** au statut Brouillon.

> Astuce : rédigez un titre contenant le mot-clé principal, structurez l'article avec des titres (heading) clairs, et répondez directement à la question dès le premier paragraphe - ces trois éléments sont bénéfiques à la fois pour le SEO et le GEO.

---

## 7. Gestion des articles

La section **Articles** répertorie tous les articles de l'organisation.

- Filtrez par **statut** (Brouillon / Publié) et par **langue**.
- Ouvrez un article pour **continuer la modification**, **réévaluer**, **traduire**, **optimiser** ou **publier**.
- La colonne des scores vous permet de repérer rapidement les articles à améliorer.

> Remarque : lorsque vous modifiez un article déjà publié puis le republiez, le logiciel **met à jour le bon article existant sur le site web** (sans créer de doublon), à condition de publier via la même connexion.

---

## 8. Optimisation SEO et GEO

La section **Optimiser** attribue un score détaillé et indique précisément les points à corriger.

1. Choisissez l'article à optimiser.
2. Consultez le tableau des scores critère par critère : titre, description (meta), structure des titres (heading), densité de mots-clés, liens internes, données structurées (schema), potentiel d'être cité par les IA...
3. Chaque point « non atteint » comporte une suggestion concrète. Appliquez la suggestion puis réévaluez jusqu'à obtenir un score élevé.

**À propos des liens internes** : ne créez de liens que vers des articles **réellement publiés** (avec une URL réelle). Ne placez pas de lien vers une page qui n'existe pas encore.

**À propos des liens externes** : toute URL vers un autre site web devrait s'ouvrir dans un nouvel onglet afin que le lecteur ne quitte pas votre page.

---

## 9. Traduction et multilingue

La section **Traductions** permet de créer une version dans une autre langue d'un article.

1. Choisissez l'article source et la (les) langue(s) cible(s).
2. Le logiciel ne traduit pas de façon mécanique mais **localise** : il adapte les exemples, les unités, le style, puis réoptimise le SEO/GEO selon les mots-clés locaux.
3. Relisez la traduction, retouchez-la si nécessaire, puis enregistrez-la comme un article distinct.

L'interface du logiciel prend en charge plusieurs langues ; changez la langue d'affichage dans le menu du compte.

---

## 10. Images : paramètres et compression

### 10.1. Paramètres d'image (images d'illustration)

La section **Paramètres d'image** définit la manière de générer et d'insérer les images des articles : style, format, texte alternatif (alt) pour le SEO.

### 10.2. Compression d'images

La section **Compression d'images** permet de réduire le poids des images et de les convertir au format **WebP/AVIF** (plus favorable au SEO, chargement plus rapide).

1. Téléversez une image.
2. Choisissez le format et le niveau de compression.
3. Téléchargez l'image optimisée. Le logiciel traite l'image directement, sans conserver vos images.

---

## 11. Publication des articles

### 11.1. Publier sur un CMS (WordPress, Wix, Shopify, Haravan, Sapo)

1. Allez dans **Publier** (ou ouvrez l'article puis choisissez de publier).
2. Choisissez la **connexion** au site web de destination.
3. Vérifiez le titre, l'URL (slug), la description, l'image de couverture.
4. Cliquez sur **Publier**. S'il s'agit d'un article déjà publié auparavant, le logiciel **met à jour** le bon article existant.

### 11.2. Publier dans un Google Sheet

Outre les CMS, vous pouvez pousser un article dans un **Google Sheet** (par exemple pour qu'une autre équipe le traite ensuite). Connectez-vous à Google une seule fois, choisissez la feuille de calcul de destination, et le logiciel inscrit chaque article ligne par ligne et le met à jour selon le slug.

### 11.3. Calendrier de publication

La section **Calendrier** permet de programmer les publications : choisissez la date et l'heure pour chaque article afin de diffuser votre contenu de manière régulière plutôt que de tout publier d'un coup.

---

## 12. Vérification et audit

- **Audit** : analyse une page/un article pour évaluer sa santé SEO et pointer les erreurs à corriger.
- **Audit de page de destination (Landing Audit)** : examine spécifiquement une page de vente/de destination, évalue le titre, l'appel à l'action et la structure de persuasion.

Utilisez ces sections pour passer en revue un contenu existant (y compris des articles non créés par le logiciel).

---

## 13. Rapports et citations

- **Rapports** : consultez le nombre de tokens utilisés, le coût de l'IA (converti dans votre devise), les statistiques par fournisseur/modèle et par collaborateur. Utile pour maîtriser vos coûts.
- **Citations** : suggère des sources fiables à citer dans l'article, ce qui renforce la crédibilité et la probabilité d'être cité par les IA (GEO).

---

## 14. Tâches et collaboration

Si votre organisation compte plusieurs personnes, utilisez la section **Mes tâches** pour le travail en équipe :

- **Attribuer un article** : le propriétaire/gestionnaire attribue un article à un rédacteur.
- **Valider un article** : un article doit être **validé** par une personne habilitée avant d'être publié. Les articles en attente de votre validation apparaissent dans **Mes tâches**.
- **Commentaires** : échangez directement sur chaque article.

La gestion des droits (qui peut rédiger, publier, valider, gérer les connexions...) se configure sur la page **Organisation** (voir la section 17).

---

## 15. Actualités et notifications

- **Cloche de notification** (en haut) : les mises à jour et notifications qui vous sont destinées.
- **Actualités** : nouvelles et astuces d'utilisation du logiciel. Les actualités **récentes** portent l'étiquette « Nouveau » ; lorsque vous ouvrez une actualité, son étiquette disparaît. Un bouton **Tout marquer comme lu** permet de tout effacer rapidement.

---

## 16. Plan et limites

La section **Abonnement** indique le plan sur lequel vous êtes, combien de rédactions d'articles il vous reste pour la période, et la date de renouvellement.

- Consultez les limites restantes et l'historique.
- Passez à un plan supérieur lorsque vous avez besoin de plus de limites ou de fonctionnalités.
- Si votre compte bénéficie de rédactions supplémentaires (overage) ou d'un accès illimité, l'information s'affiche également ici.

---

## 17. Compte, sécurité et organisation

### 17.1. Compte

La section **Compte** (cliquez sur votre nom en bas du menu) permet de modifier le nom affiché et de **changer de mot de passe**. Si vous avez oublié votre mot de passe, utilisez le lien « Mot de passe oublié » sur la page de connexion pour le réinitialiser par e-mail.

### 17.2. Organisation (Biz)

Cliquez sur le nom de l'organisation en haut du menu → **gérer l'organisation** :

- **Collaborateurs** : invitez des personnes dans l'organisation et attribuez des droits selon leur rôle.
- **Voix de marque (Brand voice)** : déclarez le style de rédaction pour que l'IA écrive dans l'esprit de votre marque.
- **Token API de l'organisation** : générez une clé pour qu'un autre système appelle votre API (destiné aux développeurs).
- **Changer/créer une nouvelle organisation** : gérez plusieurs espaces de travail.

---

## 18. Questions fréquentes (FAQ)

**Suis-je obligé d'avoir une clé API d'IA ?**
Oui. Les fonctionnalités de rédaction et d'évaluation utilisent l'IA, il faut donc au moins une clé API valide dans la section Connexions.

**Pourquoi n'arrivé-je pas encore à publier un article ?**
Vérifiez : avez-vous ajouté une connexion au site web, les informations de connexion sont-elles toujours correctes (cliquez sur Tester la connexion), et votre compte a-t-il le droit de **publier** ?

**Modifier un article déjà publié puis le republier crée-t-il un doublon ?**
Non. Le logiciel met à jour le bon article existant si vous publiez via la même connexion.

**Où corriger un score SEO/GEO faible ?**
Allez dans la section **Optimiser** : chaque critère non atteint comporte une suggestion concrète pour vous permettre de corriger puis de réévaluer.

**Comment se calcule le coût de l'IA ?**
Selon les tokens entrants/sortants du fournisseur que vous utilisez. Voir le détail dans **Rapports**.

**Je veux que plusieurs personnes travaillent ensemble ?**
Invitez-les dans l'**Organisation** et attribuez les droits. Utilisez le flux attribution d'article - validation d'article dans **Mes tâches**.

**Où changer la langue de l'interface ?**
Dans le menu du compte/choix de la langue. Le contenu des articles se traduit séparément dans la section **Traductions**.

---

## 19. Rapport Social & E-commerce (Facebook, Instagram, Threads, TikTok, YouTube, Groupes FB, Shopee, TikTok Shop, Lazada)

Analysez des canaux sociaux (les vôtres ou ceux d'un concurrent) avec des données réelles + IA, en 2 phases :

1. Allez dans **Connexions** → ajoutez la clé **Collecte de données** pour Rapport Social (suivez les instructions sur place). Chaque collecte consomme des crédits selon les résultats (généralement quelques centimes). Vous pouvez ajouter **plusieurs clés Apify** - chaque clé est testée avant l'enregistrement, et chaque collecte choisit une clé au hasard (une clé en échec ou épuisée bascule automatiquement vers une autre).
2. Ouvrez **Rapport Social** → **Créer un rapport** → une popup permet de **choisir le canal** : page Facebook, TikTok, YouTube ou **Global** (multi-plateformes). Global propose 2 modes : saisir un **mot-clé/sujet** (le système trouve automatiquement le meilleur contenu par plateforme) ou saisir directement les **liens des canaux**.
3. **Phase 1 - Collecte des données brutes** : exécution étape par étape avec progression (infos du canal → publications/vidéos → Reels/publicités pour Facebook → commentaires), puis arrêt à **Données collectées** - consultez aussitôt les données brutes + métriques par canal.
4. **Phase 2 - Analyse IA** : cliquez sur **Analyser** → choisissez IA et modèle (ou « Auto ») → l'IA analyse marque, tactiques et synthèse ; le rapport Global ajoute la **comparaison des canaux** et des conseils d'allocation. **Ré-analyser** avec une autre IA sans coût de collecte supplémentaire.
5. La liste des rapports se filtre par canal ; consultez dans le système, **Exportez en PDF**, **Téléchargez .doc** ou **Enregistrez sur Google Drive** (logo + source depuis Infos système).

6. **Style de marque** : sur la page du rapport, cliquez sur **Style de marque** → l’IA extrait un profil de style des publications/vidéos (ton, adresse, vocabulaire, structures, argumentation, formules, traits distinctifs, phrases signatures, à faire/éviter) → consultez par section et **copiez/téléchargez le Markdown** ou **copiez un prompt réutilisable** pour qu’une autre IA écrive avec cette voix de marque.

7. **Rapport Groupe Facebook** : choisissez **Groupe Facebook** dans la fenêtre de création et collez le lien d'un groupe **public** (facebook.com/groups/...). Le système collecte **les publications avec les commentaires de chacune** (les commentaires restent rattachés à leur publication pour être analysés ensemble), les infos du groupe (membres, description) et les indicateurs (fréquence, types de publications, contributeurs les plus actifs). L'IA analyse sous l'angle communauté : **sujets chauds**, **insights des membres** (besoins, points de douleur, questions, langage) et **opportunités de contenu/seeding** avec idées de publications. Portée au choix : **Populaires** (6 derniers mois) ou **Récentes**. Les groupes privés ne peuvent pas être analysés.

8. **Instagram / Threads / Produit Shopee** : choisissez le canal dans la fenêtre de création. Instagram prend un lien de profil ou @username (publications + Reels avec **transcriptions** + commentaires) ; Threads prend @username (publications + réponses, métriques repost/citation) ; Shopee prend un **lien produit** (...-i.SHOPID.ITEMID) - le système collecte les infos produit + avis clients (étoiles par aspect, variante achetée, réponses du vendeur), puis l'IA analyse la **fiche**, les **insights acheteurs** (éloges/plaintes, besoins, langage) et des **suggestions d'amélioration + contenus de vente + FAQ**. Instagram et Threads peuvent aussi rejoindre le rapport Global.

9. **Boutique Shopee** : choisissez **Boutique Shopee**, collez le lien de la boutique (ex. shopee.vn/shopname) ou le nom d'utilisateur. Le système collecte **les infos boutique** (étoiles, abonnés, total produits, taux de réponse) + **le catalogue produits** (prix, remise, note) + **les avis des meilleurs produits** (chaque avis rattaché à son produit), puis l'IA analyse **catalogue et stratégie de prix**, **insights clients inter-produits** et **synthèse & suggestions** (opportunités, améliorations, contenus de vente). Nom de rapport personnalisable comme pour le rapport produit.

10. **TikTok Shop** : la carte **TikTok Shop** (et la carte **Shopee**) regroupe les deux types - un clic demande si le rapport porte sur un **produit** ou **toute la boutique**. Produit : collez le lien produit (ou lien de partage vt.tiktok.com / ID produit) → collecte prix, remise, **ventes**, stock, variantes + avis clients → l'IA analyse la fiche, les insights acheteurs et propose des **vidéos de vente**. Boutique : saisissez le **nom de la boutique** tel qu'affiché sur TikTok Shop (pas d'URL publique) → le système trouve les produits phares + ventes totales/CA estimé + avis des meilleurs produits (rattachés à chaque produit) → l'IA analyse catalogue & prix, insights clients et synthèse. Choisissez la bonne **région** (VN par défaut).

11. **Lazada** : la carte **Lazada** regroupe aussi les deux types. Produit : collez le lien COMPLET avec le nom dans l'URL (ou un lien de partage s.lazada.vn) → collecte prix, remise, **ventes**, vendeur + avis clients en une exécution → l'IA analyse la fiche, les insights acheteurs et la synthèse. Boutique : collez le lien boutique (lazada.vn/shop/nom) → collecte le catalogue + avis rattachés à chaque produit → l'IA analyse catalogue & prix, clients et synthèse.

12. **Vue d'ensemble E-commerce** (étude de marché) : la carte **Vue d'ensemble** demande désormais **Social** (flux existant) ou **E-commerce**. E-commerce : saisissez un **mot-clé produit/niche** + région → le système collecte les **meilleures ventes** sur Shopee, TikTok Shop et Lazada → l'IA analyse le **paysage du marché** (demande, prix par place de marché), les **concurrents majeurs** et une **synthèse + plan d'entrée** (place de marché prioritaire, prix suggéré, différenciation). Idéal avant de se lancer.

13. **Graphiques visuels** : chaque rapport s'ouvre sur une section **Graphiques** - canaux sociaux : performance selon la date, top posts, formats, jour de la semaine (groupes FB : contributeurs actifs) ; produits : répartition des notes, variantes populaires ; boutiques : meilleures ventes, répartition des prix, notes (TikTok Shop ajoute le **rythme de vente 7 vs 30 jours**, vert/rouge selon hausse/baisse) ; vues d'ensemble : comparaison des canaux/places de marché. Les graphiques sont conservés dans les exports PDF/.doc/Drive.

14. **Bientôt disponible** : les canaux **Zalo** et **Messenger** sont en développement - ils apparaissent dans le sélecteur de canaux avec une étiquette « Coming soon » et ne sont pas encore sélectionnables. Ils seront activés une fois prêts.

Limites du forfait : le nombre de Rapports Social par mois et les canaux disponibles dépendent du forfait du propriétaire du compte ; le forfait Free ne peut analyser que les pages Facebook. Consultez la page **Forfaits** pour vos limites actuelles. Avec le forfait Free, les rapports de page n'affichent que le début (jusqu'à l'audience cible) et ne peuvent pas être exportés en PDF/DOC/Drive - passez à un forfait supérieur pour débloquer l'analyse complète et les exports.

Astuce : les publications sont référencées « Publication 1..N » par canal (avec le nom de la plateforme si plusieurs canaux) ; en cas d'échec, cliquez sur **Réessayer**.

---

## 20. Analyse de scripts vidéo

La section **Analyse de scripts** (menu de gauche) décortique une vidéo/un reel viral pour que vous en appreniez la formule et l'appliquiez à votre propre contenu.

1. Collez un **lien vidéo** (TikTok, YouTube ou Facebook), choisissez une **IA** et un **modèle** (ou laissez « Auto »), puis cliquez sur **Analyser**.
2. Le système détecte la plateforme → récupère la transcription → l'IA la dissèque : **résumé**, **type de contenu**, **audience**, **hook d'ouverture** (et pourquoi il fonctionne), **formule/structure**, **timeline seconde par seconde**, **ton**, **rythme**, **points forts**, **améliorations** et **enseignements à appliquer**.
3. Les résultats s'affichent directement sur la page avec la **vidéo intégrée** à côté de la timeline, pour lire et regarder en même temps. Chaque partie est un bloc à cliquer pour l'ouvrir.
4. Chaque analyse est enregistrée dans l'**Historique** juste en dessous ; cliquez sur **Ouvrir** pour la rouvrir ou sur **Supprimer**.
5. En cas d'**échec**, vous pouvez **resélectionner l'IA + le modèle** et relancer l'analyse (elle réutilise la transcription déjà récupérée — sans nouveau téléchargement).

> Nécessite une clé de **collecte de données** (Apify), comme pour le Rapport Social, afin de récupérer la transcription. L'accès dépend de votre forfait.

Pour partager une analyse à l'extérieur, voir **Partage public** (section 21).

---

## 21. Partage public (lien de partage, mot de passe, image de couverture)

Les **Rapports Social** comme les **Analyses de scripts** peuvent générer un **lien de partage public** — il suffit au visiteur d'ouvrir le lien pour voir le contenu sous forme de page web en lecture seule, **sans connexion**. (Le contenu public reste soumis au forfait du propriétaire.)

**Créer un lien :** ouvrez un rapport/une analyse terminé(e) → la zone **Partage public** → cliquez sur **Créer un lien de partage**. Le système prépare :
- Un **lien court de type blog** (par ex. `.../bao-cao-...` ou `.../kich-ban-...`) à publier sur les réseaux sociaux — c'est le lien à copier et à partager.
- Une fois le lien créé, cette zone **se replie automatiquement** ; cliquez sur **Développer** pour la modifier.

**Image de couverture (Open Graph) :** pour que le collage du lien sur Facebook/Zalo affiche un bel aperçu avec image + titre + description.
- **Générer avec l'IA** : saisissez une description d'image (facultatif), choisissez l'IA/le modèle d'image, cliquez sur **Générer une couverture IA**.
- Ou **Téléversez une image** depuis votre appareil — le système la compresse et la reformate pour qu'elle soit légère et adaptée aux réseaux sociaux.
- Laissez vide = utilise l'image par défaut (avatar du canal/logo).

**Verrouillage par mot de passe :** pour restreindre les visiteurs → définissez un **mot de passe**. Toute personne ouvrant le lien doit saisir le bon mot de passe pour voir le contenu (l'image de couverture/le titre restent visibles lors du partage). Vous pouvez **changer le mot de passe** ou **Retirer le verrou** (le rendre public à nouveau) à tout moment.

**Gérer les liens :** le **Rapport Social** (et l'**Analyse de scripts**) dispose d'un onglet **Liens de partage** qui liste tous les liens créés : **Copier**, **Ouvrir**, **Modifier** le titre/la description/l'image, définir/retirer le **mot de passe**, **Révoquer** (désactiver temporairement) ou **Supprimer**. Une fois révoqué/supprimé, l'ancien lien ne fonctionne plus.

---

## 22. Bibliothèque d'images

La section **Bibliothèque d'images** (menu de gauche) rassemble toutes les images créées par l'IA ou téléversées dans le système.

- **Voir** toutes les images sous forme de grille.
- **Renommer** ou **Supprimer** une image.
- **Sélectionner plusieurs** images pour les supprimer en masse — lors d'une suppression multiple, vous devez taper **DELETE** pour confirmer (afin d'éviter les accidents).

---

## 23. Besoin d'aide supplémentaire ?

- Relisez la section concernée de ce guide (utilisez le champ de recherche en haut de la page).
- Avec un compte récent, vous pouvez rouvrir la partie **introduction rapide** grâce au bouton « Revoir le guide » sur la page Tableau de bord.
- Si vous êtes toujours bloqué, contactez l'administrateur de votre système.
