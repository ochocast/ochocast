# Maquette — recherche dans le contenu des vidéos

Maquette interactive validée par le client avant la rédaction du design V1 (`../../2026-11-12-recherche-par-contenu-design.md`). Elle sert de **référence visuelle et de comportement**. En cas d’écart, c’est le document de design qui fait foi.

- Version en ligne (privée, compte de l’équipe) : <https://claude.ai/artifact/1tSgfaUH4aKcZRP8jw8Mtb>
- `maquette/Main.dc.html` : source de la maquette (format « Design canvas » de claude.ai), copiée le 12 novembre 2026.
- `maquette/canvas.json` : disposition du canevas.
- `captures/` : captures des écrans clés.

## Lire la source

Le fichier ne s’ouvre pas tel quel dans un navigateur : il dépend du moteur du canevas (`support.js`). Il se lit comme une référence :

- **Structure et styles :** le balisage dans `<x-dc>`. Tous les styles sont en ligne : couleurs, tailles, rayons et espacements sont ceux de l’application actuelle (police Outfit, vert `#147854` / `#1dac78`).
- **Écrans :** trois blocs `<sc-if>` — accueil (`isHome`), résultats (`isResults`), page vidéo (`isVideo`) — plus le menu d’exemples et le panneau de filtres de l’en-tête.
- **Données :** la méthode `raw()` contient les six vidéos et leurs sous-titres. Ce sont les mêmes que l’annexe A du document de design.
- **Logique :** `parse`, `search`, `parts`, `fmt`, `jump`. C’est une **imitation simplifiée en JavaScript** du comportement attendu de PostgreSQL. Le comportement de référence est celui de la section 6.4 du design, pas ce code.

## Images

Les `src="/_blob/<id>"` pointent vers les fichiers déposés dans l’artefact. Correspondance avec le dépôt :

| Identifiant | Fichier d’origine |
|---|---|
| `f03cf78ae6ebd5fc0577b39786a143e8` | `frontend/public/branding/ochoIconFull.svg` |
| `6f731f34686824cce61df8df09d84f66` | `frontend/public/branding/search.svg` |
| `5bf099b464eacf69adf04a6899116b84` | `frontend/src/assets/filter_icon.svg` |
| `060c89814e805f6dd0e58c9c809f4fd9` | `frontend/src/assets/copy.svg` |
| `180a53a3e1b2f2ec47689321ecc02320` | `frontend/src/assets/star.svg` |
| `3884c34dc57c98ddf77e4125e2cfff8b` | `frontend/src/assets/ViewIcon.svg` |
| `52b50886195db6bef0c4568f7a0cc677` | `frontend/src/components/ReworkComponents/generic/Header/UserBadge/profile-picture.svg` |
| `4882c0a2296e38c662fb224932543d3e` | `frontend/public/branding/persona.png` (réduit) |
| `23943080c257bc07e9d9663135f01022` | `frontend/public/branding/exemple/image_tuile_event.png` (réduit) |
| `57ebae3e…`, `ac5322ea…`, `3c12d362…`, `d311a384…` | Miniatures de vidéos de test de staging, non versionnées |

L’icône « modifier » des vignettes est redessinée en SVG en ligne : `frontend/src/assets/edit.svg` n’a pas pu être importé dans l’artefact.

## Écarts entre la maquette et la V1

| Maquette | V1 (document de design) |
|---|---|
| Repères jaunes sur la barre de progression du lecteur | Repères dans une **barre des passages sous le lecteur** ; le lecteur garde ses contrôles natifs (section 5.3) |
| Exemples de requêtes dans le menu de la barre de recherche | Contenu de démo : en production, seule la ligne d’aide sur la syntaxe reste (section 5.1) |
| `kubernets` ne trouve rien | La racinisation française rattrape `kubernets` ; l’exemple de faute est `kubrnetes` (critère 9) |
| « Vouliez-vous dire … ? » affiché, marqué « prévu en V1.1 » | Pas de suggestion en V1 (section 12) |
| Les mots d’une recherche peuvent être dans des champs différents | Identique en V1 (objectif 4) |
| Page vidéo : panneau de transcription à droite | Identique sur ordinateur ; sous la barre des passages sous 1024 px (section 5.5) |
