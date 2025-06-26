# Personalisation

La personnalisation du nom de l’application, du logo et des couleurs se fait directement dans le fichier :  
`frontend/public/branding/theme.yaml`

Ce fichier centralise les paramètres de branding et est relié à plusieurs parties du code pour appliquer automatiquement les changements dans toute l’application.

## 1. Où configurer le branding ?
- **Fichier principal** : `frontend/public/branding/theme.yaml`
  - Tu y définis le nom de l’application, le logo, les couleurs principales, etc.
  - Exemple :
    ```yaml
    appName: "OctoCast"
    logo: "/branding/ochoIconFull.svg"
    color_var1: "#123456"
    color_var2: "#abcdef"
    ```

## 2. Typage et intégration
- Le schéma de ce fichier YAML est défini dans :  
  `frontend/src/branding/type.ts`  
  (ex : interface ou type `BrandingConfig`)
- Cela garantit que les propriétés du YAML sont bien typées et validées dans le code.

## 3. Utilisation dans les composants
- **Header** :  
  Le composant d’en-tête principal (`frontend/src/components/ReworkComponents/generic/Header/header.tsx`) utilise les valeurs du branding pour afficher le nom, le logo et appliquer les couleurs.
- **BrandingContext** :  
  Le contexte React `frontend/src/brandingContext.tsx` charge et fournit le branding à toute l’application.
- **Hook useBranding** :  
  Le hook `frontend/src/hooks/useBranding.ts` permet d’accéder facilement aux valeurs du branding dans n’importe quel composant React.
- **Application globale** :  
  Le branding est appliqué dès le composant racine `frontend/src/App.tsx` pour que toute l’UI soit cohérente.

## 4. Comment ça marche ?
1. Au démarrage, le contexte `BrandingContext` charge le fichier `theme.yaml`.
2. Les valeurs sont typées via `type.ts` et accessibles via le hook `useBranding`.
3. Les composants (comme le Header) consomment ces valeurs pour afficher le nom, le logo et appliquer les couleurs.
4. Toute modification dans `theme.yaml` est automatiquement propagée à l’UI après un rafraîchissement.

## 5. Exemple de modification
- Pour changer le nom, le logo ou une couleur, modifie simplement `theme.yaml` :
  ```yaml
  appName: "MaSuperApp"
  logo: "/branding/monlogo.svg"
  color_var1: "#ff6600"
  ```
- Redémarre le front si besoin pour voir les changements.

---

**Résumé :**
- Tout le branding se configure dans `theme.yaml`.
- Le typage est assuré par `type.ts`.
- Le contexte, le hook et les composants consomment ces valeurs pour afficher dynamiquement le branding dans toute l’application.