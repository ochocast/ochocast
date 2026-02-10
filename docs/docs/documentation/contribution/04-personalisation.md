# Personnalisation

La personnalisation du branding de l'application, incluant le nom, les images et les couleurs, est centralisée dans un fichier unique : `frontend/public/branding/theme.yaml`.

## 1. Où configurer le branding ?

Le fichier principal pour la configuration du branding est :

```yaml
frontend/public/branding/theme.yaml
```

Dans ce fichier, vous pouvez définir :
- Le nom de l'application (`appName`)
- Les couleurs principales (`colors`)
- Les images de branding (`images`)

### Exemple de configuration :

```yaml
appName: "OchoCast"

colors:
  primary: "#1dac78"      # Couleur principale (boutons, liens, accents)
  secondary: "#344054"    # Couleur secondaire (textes, bordures)
  background: "#f9fafb"   # Couleur de fond
  accent: "#2ecc71"       # Couleur d'accent (alertes, highlights)
  error: "#dc2626"        # Couleur d'erreur (messages d'erreur)

images:
  logo: "::default::ochoIconFull.svg"
  default_miniature_image: "::default::exemple/image_tuile_event.png"
  add: "::default::add.svg"
  plus: "::default::plus.svg"
  search: "::default::search.svg"
  cross: "::default::cross.svg"
  user_placeholder: "::default::persona.png"
```

## 2. Typage et validation

Le schéma de ce fichier YAML est défini dans :

```typescript
frontend/src/branding/types.ts
```

L'interface `BrandingConfig` garantit que les propriétés du fichier sont bien typées et validées dans le code TypeScript.

## 3. Génération automatique des couleurs

Le système de branding simplifie la gestion des couleurs en générant automatiquement des variantes. À partir de 4-5 couleurs de base, il produit plus de 50 variantes pour toute l'application.

### Fonctionnement :
- **Couleurs claires (50-400)** : Mélange progressif avec du blanc
- **Couleur de base (500)** : Couleur exacte définie dans le fichier
- **Couleurs foncées (600-900)** : Mélange progressif avec du noir

Ces variantes sont générées par la fonction `generateColorVariants` dans :

```typescript
frontend/src/utils/colorUtils.ts
```

### Variables CSS générées :
Pour chaque couleur de base, le système crée des variables CSS :
- `--theme-color`, `--theme-color-50` à `--theme-color-900`
- `--bg-color`, `--bg-color-50` à `--bg-color-900`
- `--accent-color`, `--accent-color-50` à `--accent-color-900`
- `--error-color`, `--error-color-50` à `--error-color-900`

## 4. Utilisation dans les composants

### Hook `useBranding`
Le hook `useBranding` est défini dans :

```typescript
frontend/src/hooks/useBranding.ts
```

Il permet de :
- Charger le fichier `theme.yaml`
- Générer les variantes de couleurs via `generateColorVariants`
- Injecter dynamiquement les variables CSS dans le DOM
- Retourner la configuration pour une utilisation dans les composants React

### Composant `ColorPreview`
Le composant `ColorPreview` est utilisé pour afficher les variantes de couleurs générées. Il est défini dans :

```typescript
frontend/src/components/ReworkComponents/generic/ColorPreview/ColorPreview.tsx
```

## 5. Panneau d'administration

Le panneau d'administration permet de modifier le branding en temps réel. Il est accessible à l'URL : `/admin` (droits administrateur requis).

### Fonctionnalités :
- Modifier le nom de l'application
- Changer les couleurs principales
- Prévisualiser les dégradés en temps réel
- Modifier les images de branding
- Sauvegarder la configuration sur le serveur

Le fichier correspondant est :

```typescript
frontend/src/pages/adminPanel/adminPanel.tsx
```

:::tip Guide détaillé
Pour un guide complet et détaillé du panneau d'administration avec des explications sur chaque champ et fonctionnalité, consultez le **[Guide du Panneau d'Administration](../utilisation/02-panneau-admin.md)**.
:::

## 6. Résumé

- **4-5 couleurs définies** → **50+ variables CSS générées automatiquement**
- Système de dégradés automatiques (variantes 50-900)
- Panneau d'administration pour modification en temps réel
- Tout le branding centralisé dans `theme.yaml`
- Architecture modulaire et typée avec TypeScript
- Rechargement automatique après sauvegarde pour appliquer les changements
