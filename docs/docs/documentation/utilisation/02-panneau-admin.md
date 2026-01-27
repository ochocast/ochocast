# Guide du Panneau d'Administration

Le panneau d'administration d'OchoCast permet aux administrateurs de personnaliser l'apparence de l'application en temps réel sans modifier directement le code source. Ce guide détaille chaque fonctionnalité et son impact visuel.

## Accès au Panneau

**URL d'accès** : `/admin`

:::warning Droits requis
Seuls les utilisateurs avec des **droits administrateur** peuvent accéder à ce panneau. Les utilisateurs non-administrateurs seront redirigés vers une page 404.
:::

## Vue d'ensemble

Le panneau d'administration est organisé en plusieurs sections :

1. **Informations générales** - Nom de l'application
2. **Couleurs du thème** - Palette de couleurs principale
3. **Prévisualisation des couleurs** - Aperçu des dégradés générés
4. **Images de branding** - Logos et icônes personnalisés
5. **Gestion des contenus** - Archivage et administration des vidéos ([Accéder](#gestion-des-contenus))

![Vue d'ensemble du panneau d'administration](/img/admin-panel-overview2.png)
*Vue complète du panneau d'administration avec toutes les sections*

La section **Gestion des contenus** (voir lien ci‑dessus) couvre les opérations d'archivage des vidéos, ainsi que les fonctions réservées aux administrateurs : consultation des vidéos archivées, restauration et suppression définitive.

![Vue du switch du panneau d'administration vers la gestion de vidéo admin](/img/admin-top-panel.png)

Cette documentation est organisée en deux parties clairement séparées : la **configuration du thème** (sections 1–4) et la **gestion des contenus** (archivage et administration des vidéos). Utilisez ces raccourcis pour naviguer rapidement : [Configuration du thème](#configuration-du-theme) · [Gestion des contenus](#gestion-des-contenus)

---

## Démarrage rapide

1. Connectez-vous en tant qu'utilisateur administrateur.
2. Ouvrez l'URL `/admin`.
3. Dans **Informations générales**, modifiez `appName` si nécessaire puis cliquez sur **Sauvegarder la configuration**.
4. Ajustez les couleurs dans **Couleurs du thème**.
5. Uploadez les images dans **Images de Branding**, puis sauvegardez.

---

<a id="configuration-du-theme"></a>

## 1. Informations Générales

![Section informations générales](/img/admin-general-info.png)
*Section permettant de modifier le nom de l'application*

### Nom de l'Application

**Champ** : `Application Name` / `Nom de l'application`

**Description** : Ce champ définit le nom affiché dans toute l'application.

**Effet visible** :
- Apparaît dans le titre de la page (onglet du navigateur)
- Affiché dans la barre de navigation
- Utilisé dans les emails et notifications

**Exemple** :
```yaml
appName: "OchoCast"
```

**Où le voir** :
- En haut à gauche de la barre de navigation
- Dans l'onglet du navigateur
- Sur la page de connexion

![Logo dans la navbar](/img/admin-effect-logo-before.png)
*Exemple de logo affiché dans la barre de navigation*

---

## 2. Couleurs du Thème

![Section couleurs du thème](/img/admin-colors.png)
*Les 5 champs de couleur avec leurs sélecteurs*

Le système de couleurs utilise un format hexadécimal avec transparence (8 caractères : `#RRGGBBAA`).

### 2.1 Couleur Principale (Primary)

**Champ** : `primary`

**Description** : La couleur principale de l'application, utilisée pour les éléments interactifs et les accents importants.

**Effet visible** :
- Boutons principaux (connexion, enregistrer, valider)
- Liens cliquables
- Éléments de navigation actifs
- Barres de progression
- Icônes importantes

**Format** : `#1dac78ff` (vert par défaut)

**Exemple d'utilisation** :
- Bouton "Sauvegarder la configuration" dans le panneau admin
- Bouton "Se connecter" sur la page d'authentification
- Liens dans la barre de navigation

**Avant/Après modification des couleurs** :

![Couleurs avant](/img/admin-effect-colors-before.png)
*Application avec les couleurs par défaut*

![Couleurs après](/img/admin-effect-colors-after.png)
*Application avec les nouvelles couleurs personnalisées*

**Comment modifier** :
1. Cliquez sur le sélecteur de couleur (carré coloré)
2. Choisissez une couleur dans le picker
3. OU entrez directement un code hexadécimal dans le champ texte

![Sélecteur de couleur](/img/admin-color-picker.png)

*Color picker ouvert pour sélectionner une couleur*

### 2.2 Couleur Secondaire (Secondary)

**Champ** : `secondary`

**Description** : Couleur utilisée pour les textes secondaires et les bordures.

**Effet visible** :
- Textes de description
- Bordures des cartes
- Séparateurs
- Textes de formulaire

**Format** : `#344054ff` (gris foncé par défaut)

**Exemple d'utilisation** :
- Texte des descriptions sous les titres
- Bordures des champs de formulaire
- Lignes de séparation entre les sections

### 2.3 Couleur de Fond (Background)

**Champ** : `background`

**Description** : Couleur de fond principale de l'application.

**Effet visible** :
- Arrière-plan de toutes les pages
- Fond des sections
- Espaces entre les cartes

**Format** : `#f9fafbff` (gris très clair par défaut)

**Exemple d'utilisation** :
- Fond de la page d'accueil
- Arrière-plan du panneau d'administration
- Fond des listes de vidéos

### 2.4 Couleur d'Accent (Accent)

**Champ** : `accent`

**Description** : Couleur utilisée pour attirer l'attention sur des éléments spécifiques.

**Effet visible** :
- Badges de notification
- Highlights
- Alertes d'information
- Éléments en surbrillance

**Format** : `#2ecc71ff` (vert clair par défaut)

**Exemple d'utilisation** :
- Badge "Nouveau" sur les vidéos récentes
- Notifications de succès
- Éléments mis en avant

### 2.5 Couleur d'Erreur (Error)

**Champ** : `error`

**Description** : Couleur utilisée pour les messages d'erreur et les alertes critiques.

**Effet visible** :
- Messages d'erreur
- Bordures de champs invalides
- Boutons de suppression
- Alertes critiques

**Format** : `#dc2626ff` (rouge par défaut)

**Exemple d'utilisation** :
- Message "Erreur lors de la sauvegarde"
- Bordure rouge autour d'un champ mal rempli
- Bouton "Supprimer" dans les actions dangereuses

---

## 3. Prévisualisation des Couleurs

![Prévisualisation des dégradés](/img/admin-color-preview.png)
*Palettes de couleurs générées automatiquement (variantes 50-900)*

Cette section affiche automatiquement les **variantes générées** à partir des couleurs de base.

### 3.1 Système de Dégradés

Pour chaque couleur de base, le système génère **10 variantes** (50, 100, 200, 300, 400, 500, 600, 700, 800, 900) :

- **50-400** : Variantes claires (mélange avec du blanc)
- **500** : Couleur de base exacte
- **600-900** : Variantes foncées (mélange avec du noir)

### 3.2 Prévisualisation de la Couleur Principale

**Section** : `Primary Color Preview`

**Affichage** :
- Palette complète des 10 variantes de la couleur principale
- Code hexadécimal de chaque variante
- Aperçu visuel en temps réel

**Variables CSS générées** :
```css
--theme-color-50
--theme-color-100
--theme-color-200
--theme-color-300
--theme-color-400
--theme-color-500  /* Couleur de base */
--theme-color-600
--theme-color-700
--theme-color-800
--theme-color-900
```

### 3.3 Prévisualisation de la Couleur de Fond

**Section** : `Background Color Preview`

**Affichage** :
- Palette complète des 10 variantes de la couleur de fond
- Code hexadécimal de chaque variante
- Aperçu visuel en temps réel

**Variables CSS générées** :
```css
--bg-color-50
--bg-color-100
--bg-color-200
--bg-color-300
--bg-color-400
--bg-color-500  /* Couleur de base */
--bg-color-600
--bg-color-700
--bg-color-800
--bg-color-900
```

---

## 4. Images de Branding

![Section images de branding](/img/admin-images.png)
*Liste des images personnalisables avec aperçus*

Cette section permet de personnaliser toutes les images utilisées dans l'application.

### 4.1 Logo Principal

**Champ** : `logo`

**Description** : Logo principal de l'application affiché dans la barre de navigation.

**Format accepté** : SVG, PNG, JPG

**Dimensions recommandées** : 
- Largeur : 150-200px
- Hauteur : 40-60px
- Format : SVG (pour une meilleure qualité)

**Effet visible** :
- Affiché en haut à gauche de la barre de navigation
- Visible sur toutes les pages
- Utilisé comme favicon

![Logo principal](/img/logo_main.png)
*Logo affiché dans la barre de navigation*

**Comment modifier** :
1. Cliquez sur "Choisir un fichier" sous l'aperçu actuel
2. Sélectionnez votre nouveau logo
3. L'aperçu s'affiche immédiatement
4. Cliquez sur "Sauvegarder la configuration" pour appliquer

### 4.2 Image Miniature par Défaut

**Champ** : `default_miniature_image`

**Description** : Image utilisée comme miniature par défaut pour les vidéos sans vignette personnalisée.

**Format accepté** : PNG, JPG, WEBP

**Dimensions recommandées** : 
- Largeur : 1280px
- Hauteur : 720px
- Ratio : 16:9

**Effet visible** :
- Affiché sur les cartes de vidéos sans miniature
- Utilisé dans les listes de vidéos
- Visible sur la page d'accueil

**Exemple d'utilisation** :
- Nouvelle vidéo uploadée sans vignette
- Vidéo en cours de traitement
- Placeholder pour les événements en direct

### 4.3 Icône d'Ajout

**Champ** : `add`

**Description** : Icône utilisée pour les boutons d'ajout.

**Format accepté** : SVG (recommandé), PNG

**Dimensions recommandées** : 24x24px ou 32x32px

**Effet visible** :
- Bouton "Ajouter une vidéo"
- Bouton "Créer un événement"
- Actions d'ajout dans les formulaires

### 4.4 Icône Plus

**Champ** : `plus`

**Description** : Icône plus utilisée dans les interfaces.

**Format accepté** : SVG (recommandé), PNG

**Dimensions recommandées** : 24x24px

**Effet visible** :
- Boutons d'expansion
- Actions d'ajout rapide
- Menus déroulants

![Icône plus](/img/logo_plus.png)

*Icône d'ajout utilisée dans l'interface*

### 4.5 Icône de Recherche

**Champ** : `search`

**Description** : Icône de loupe pour les fonctionnalités de recherche.

**Format accepté** : SVG (recommandé), PNG

**Dimensions recommandées** : 20x20px ou 24x24px

**Effet visible** :
- Barre de recherche dans l'en-tête
- Champs de recherche dans les listes
- Filtres de recherche

![Icône de recherche](/img/logo_search.png)

*Icône de recherche dans la barre de navigation*

### 4.6 Icône de Fermeture

**Champ** : `cross`

**Description** : Icône de croix pour fermer les modales et supprimer des éléments.

**Format accepté** : SVG (recommandé), PNG

**Dimensions recommandées** : 20x20px ou 24x24px

**Effet visible** :
- Bouton de fermeture des modales
- Suppression d'éléments
- Annulation d'actions

![Icône de fermeture](/img/logo_cross.png)

*Icône de fermeture utilisée dans les fenêtres modales*

### 4.7 Image Placeholder Utilisateur

**Champ** : `user_placeholder`

**Description** : Image par défaut pour les profils utilisateurs sans photo.

**Format accepté** : PNG, JPG, SVG

**Dimensions recommandées** : 
- Largeur : 200px
- Hauteur : 200px
- Format : Carré

**Effet visible** :
- Avatar par défaut dans les profils
- Image de profil dans les commentaires
- Icône utilisateur dans la navigation

---

## 5. Sauvegarde de la Configuration

### Bouton de Sauvegarde

**Label** : `Sauvegarder la configuration` / `Save Configuration`

**États du bouton** :

1. **Actif (vert)** : Des modifications ont été détectées
   - Le bouton est cliquable
   - Couleur : Couleur principale du thème

![Bouton actif](/img/admin-save-button-active.png)

*Bouton de sauvegarde actif (modifications détectées)*
   
2. **Désactivé (gris)** : Aucune modification
   - Le bouton n'est pas cliquable
   - Aucun changement à sauvegarder

![Bouton désactivé](/img/admin-save-button-disabled.png)

*Bouton de sauvegarde désactivé (aucune modification)*

3. **En cours (gris)** : Sauvegarde en cours
   - Label : "Sauvegarde en cours..." / "Saving in progress..."
   - Le bouton n'est pas cliquable

### Processus de Sauvegarde

1. **Validation** : Vérification des formats de couleurs
2. **Conversion** : Transformation en fichier YAML
3. **Upload** : Envoi au serveur avec les images
4. **Confirmation** : Message de succès ou d'erreur
5. **Rechargement** : La page se recharge automatiquement après 200ms

### Messages de Retour

**Succès** :
```
✓ Configuration mise à jour avec succès
```
- Toast vert en haut de l'écran
- Rechargement automatique de la page

**Erreur de couleur** :
```
✗ Couleur invalide pour [nom_du_champ]
```
- Toast rouge en haut de l'écran
- La sauvegarde est annulée

**Erreur de serveur** :
```
✗ Erreur lors de la mise à jour de la configuration
```
- Toast rouge en haut de l'écran
- Les modifications ne sont pas appliquées

---

## 6. Workflow Recommandé

### Étape 1 : Planification
1. Définissez votre palette de couleurs (utilisez des outils comme [Coolors](https://coolors.co/))
2. Préparez vos images aux bonnes dimensions
3. Testez les contrastes pour l'accessibilité

### Étape 2 : Modification des Couleurs
1. Accédez au panneau admin (`/admin`)
2. Modifiez la couleur principale en premier
3. Vérifiez la prévisualisation des dégradés
4. Ajustez les autres couleurs en conséquence
5. Assurez-vous que les contrastes sont suffisants

### Étape 3 : Modification des Images
1. Uploadez le logo principal
2. Vérifiez l'aperçu
3. Uploadez les autres images si nécessaire
4. Vérifiez que les dimensions sont correctes

### Étape 4 : Sauvegarde et Vérification
1. Cliquez sur "Sauvegarder la configuration"
2. Attendez le message de confirmation
3. La page se recharge automatiquement
4. Vérifiez que tous les changements sont appliqués
5. Testez la navigation dans l'application

---

## 7. Conseils et Bonnes Pratiques

### Couleurs

**À faire** :
- Utilisez des couleurs avec un bon contraste (ratio minimum 4.5:1)
- Testez les couleurs sur différents écrans
- Gardez une cohérence avec votre charte graphique
- Utilisez le format hexadécimal complet (8 caractères)

**À éviter** :
- Couleurs trop claires pour le texte
- Trop de couleurs différentes (restez cohérent)
- Couleurs flashy qui fatiguent les yeux
- Oublier la transparence dans le code hex

### Images

**À faire** :
- Utilisez des SVG pour les logos et icônes (meilleure qualité)
- Optimisez la taille des images (< 500 Ko)
- Respectez les dimensions recommandées
- Utilisez des images avec fond transparent pour les logos

**À éviter** :
- Images trop lourdes (> 2 Mo)
- Mauvaise qualité ou pixellisation
- Formats non supportés
- Images avec des dimensions incorrectes

### Accessibilité

- **Contraste** : Vérifiez que le texte est lisible sur tous les fonds
- **Daltonisme** : Testez vos couleurs avec des simulateurs de daltonisme
- **Taille** : Assurez-vous que les icônes sont assez grandes (minimum 24x24px)

---

## 8. Dépannage

### Le bouton de sauvegarde est désactivé

**Cause** : Aucune modification détectée

**Solution** : Modifiez au moins un champ pour activer le bouton

### Message "Couleur invalide"

**Cause** : Format de couleur incorrect

**Solution** : 
- Utilisez le format `#RRGGBBAA` (8 caractères)
- Exemple valide : `#1dac78ff`
- Exemple invalide : `#1dac78` (manque la transparence)

### Les images ne s'affichent pas

**Cause** : Format ou taille non supporté

**Solution** :
- Vérifiez le format (PNG, JPG, SVG)
- Réduisez la taille si > 2 Mo
- Vérifiez les dimensions

### Les changements ne sont pas appliqués

**Cause** : Cache du navigateur

**Solution** :
1. Videz le cache du navigateur (Ctrl + Shift + R)
2. Ou attendez le rechargement automatique après sauvegarde

### Erreur lors de la sauvegarde

**Cause** : Problème de connexion au serveur

**Solution** :
1. Vérifiez votre connexion internet
2. Vérifiez que le serveur backend est actif
3. Consultez les logs du serveur
4. Contactez l'administrateur système

## Gestion des contenus {#gestion-des-contenus}

Sur la droite du panneau d'administration (voir le second écran), un nouvel onglet **Gestion des contenus** permet d'administrer les vidéos du service : listes, archivage, restauration et suppression définitive.

![Vue d'ensemble de la page gestion des contenus](/img/admin-video-gestion.png)

### Accès et permissions

- **Administrateurs** : peuvent voir toutes les vidéos, y compris les vidéos archivées ; ils peuvent **restaurer** une vidéo (la remettre en ligne) ou **supprimer définitivement** une vidéo et ses métadonnées.
- **Utilisateurs classiques** : peuvent **archiver** leurs propres vidéos depuis leur espace utilisateur ; une vidéo archivée n'est plus visible publiquement ni listée pour l'auteur dans les vues publiques. Les utilisateurs non‑administrateurs ne voient pas les vidéos archivées globalement.

### Organisation de la page

La page comprend :

- Des filtres en haut : `Toutes`, `Actives`, `Archivées` pour basculer entre les états.
- Un tableau listant les vidéos avec les colonnes : **Titre**, **Créateur**, **Date de création**, **Vues**, **Statut**, **Actions**.

### Actions disponibles

- **Archiver** (utilisateur) : masque la vidéo du catalogue public et la place en statut "archivée".
- **Restaurer** (administrateur) : remet la vidéo en publication (visible dans les listes publiques) avec ses métadonnées.
- **Supprimer définitivement** (administrateur) : supprime la vidéo et ses métadonnées de la plateforme — action irréversible.

### Comportement attendu

- Lorsqu'une vidéo est archivée par son auteur, elle disparaît des listes publiques et n'est pas visible par défaut. Seuls les administrateurs peuvent ensuite restaurer ou supprimer définitivement.
- La restauration rétablit la visibilité et les métadonnées telles qu'elles étaient avant l'archivage, à condition que les fichiers médias soient toujours présents sur le stockage.

### Bonnes pratiques

- Vérifier l'existence d'une sauvegarde avant toute **suppression définitive**.
- Journaliser les opérations critiques (restauration, suppression) pour audit.
- Prévenir l'auteur avant suppression définitive si possible.