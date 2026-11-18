# Pré-découpage automatique : proposition avant implémentation

Cette étape n’est pas implémentée. Les choix ci-dessous sont à valider avant de créer un contrat API ou une nouvelle tâche worker.

| Option | Méthode FFmpeg | Intérêt | Limites |
| --- | --- | --- | --- |
| Silences | `silencedetect` sur l’audio | Pauses naturelles d’un exposé ; pas besoin d’analyser les images | Bruit de salle, musique ou parole continue ; absence possible d’audio |
| Plans | `scdet` sur la vidéo | Changements de caméra ou diapositives | Animations, transitions et mouvements produisent des faux positifs ; analyse des images nécessaire |
| Hybride | Silences prioritaires, plans en complément | Couvre des contenus variés | Paramétrage, coût et explication des résultats plus complexes |

Recommandation : commencer par **les silences, sur demande**, en proposant des points de coupe que l’utilisateur révise. Ne supprimer aucun intervalle automatiquement : découper ne signifie pas retirer le silence. L’analyse se ferait côté worker sur l’original ; aucun FFmpeg dans le navigateur et aucun appel long bloquant le backend.

Paramètres de départ à mesurer sur un petit corpus, sans les considérer comme des décisions produit : seuil audio -35 dB, silence d’au moins 0,8 s, coupe au milieu du silence. Filtrer les points pour garder au moins 5 s par passage, ne jamais dépasser 100 passages, garder la couverture de l’original. Sans audio ou sans point valable, conserver un passage. Le plafond de 45 minutes reste appliqué au montage envoyé : le pré-découpage seul ne raccourcit pas la vidéo.

Questions avant code :

1. Confirmer « suggestions de coupes » sans suppression automatique, ou définir précisément ce qui doit être retiré.
2. Choisir l’exécution : tâche d’analyse dédiée ou évolution du worker avec file et limites explicitement définies par ops. Ne pas ralentir le rendu existant.
3. Définir le contrat API (demande, suivi, résultats), l’idempotence, la durée de conservation et les droits créateur/admin.
4. Limiter la première version à un montage initial sans textes, ou définir comment appliquer les suggestions à un montage local déjà modifié. Ne pas écraser de changements locaux.
5. Valider les seuils sur des vidéos de conférences, déterminer temps maximal et taille source, puis mesurer le coût en préproduction.

Références primaires : [silencedetect](https://ffmpeg.org/ffmpeg-filters.html#silencedetect), [scdet](https://ffmpeg.org/ffmpeg-filters.html#scdet).
