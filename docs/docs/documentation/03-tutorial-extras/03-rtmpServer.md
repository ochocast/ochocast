# Serveur RTMP
## Docker RTMP-HLS

**Image Docker pour serveur de streaming vidéo qui prend en charge les flux RTMP, HLS et DASH.**


## Description

Cette image Docker peut être utilisée pour créer un serveur de streaming vidéo prenant en charge les flux [**RTMP**](https://en.wikipedia.org/wiki/Real-Time_Messaging_Protocol), [**HLS**](https://en.wikipedia.org/wiki/HTTP_Live_Streaming), [**DASH**](https://en.wikipedia.org/wiki/Dynamic_Adaptive_Streaming_over_HTTP) dès la sortie de la boîte. Elle permet également le streaming adaptatif et la transcodification personnalisée des flux vidéo.
Le module est construit à partir du code source sur une image de base Alpine Linux.



## Fonctionnalités

* Le backend est [**Nginx**](http://nginx.org/fr/) avec le [**nginx-rtmp-module**](https://github.com/arut/nginx-rtmp-module).
* [**FFmpeg**](https://www.ffmpeg.org/) pour la transcodification et le streaming adaptatif.
* Paramètres par défaut :
  * RTMP activé
  * HLS activé (adaptatif, 5 variantes)
  * DASH activé
  * Un autre fichier de configuration Nginx est également fourni pour permettre un streaming sans transcodification via FFmpeg.
* Page de statistiques des flux RTMP accessible à `http://<ip_du_serveur>:<port_du_serveur>/stats`.
* Lecteurs vidéo web disponibles (basés sur [video.js](https://videojs.com/) et [hls.js](https://github.com/video-dev/hls.js/)) dans `/usr/local/nginx/html/players`.

L'image actuelle est construite avec :
* Nginx 1.21.5 (compilé à partir du code source) (les versions plus récentes de Nginx semblent avoir des problèmes avec la page de statistiques (pid 8))
* Nginx-rtmp-module 1.2.2 (compilé à partir du code source)
* FFmpeg 6.0 (compilé à partir du code source)



## Utilisation

### Pour construire l'image
```
docker build -t octocast_rtmp_server .
```


### Pour exécuter le serveur
```
docker run -d -p 1935:1935 -p 8080:8080 octocast_rtmp_server
```
où `1935` est le port RTMP et `8080` est le port HTTP.


### Pour streamer vers le serveur
 * **Streamer du contenu RTMP en direct vers :**
	```
	rtmp://<server ip>:1935/live/<stream_key>
	```
	où `<stream_key>` est la clé de flux que vous spécifiez.

 * **Configurer [OBS](https://obsproject.com/) pour streamer le contenu :** <br />
Allez dans Paramètres > Stream, choisissez les paramètres suivants :
* Service : Serveur de Streaming personnalisé.
* Serveur : `rtmp://<ip_du_serveur>:1935/live`. 
* Clé de flux : choisissez ce que vous voulez, cependant les lecteurs vidéo fournis supposent que la clé de flux est `test`.


### Pour visualiser le flux
* **Avec [VLC](https://www.videolan.org/vlc/index.html) :**
* Allez dans Média > Ouvrir un flux réseau.
* Entrez l'URL du flux : `rtmp://<ip_du_serveur>:1935/live/<stream-key>`
  Remplacez `<ip_du_serveur>` par l'adresse IP du serveur, et `<stream-key>` par la clé de flux que vous avez utilisée pour configurer le stream.
* Pour HLS et DASH, les URLs sont sous les formes :  
  `http://<ip_du_serveur>:8080/hls/<stream-key>.m3u8` et  
  `http://<ip_du_serveur>:8080/dash/<stream-key>_src.mpd` respectivement.
* Cliquez sur Play.

* **Avec les lecteurs web fournis : (fournis dans le repo poc)**  
Les lecteurs de démonstration supposent que la clé de flux est appelée `test`.  
* Pour lire du contenu HLS : `http://<ip_du_serveur>:8080/players/hls.html`
* Pour lire du contenu HLS avec la bibliothèque hls.js : `http://<ip_du_serveur>:8080/players/hls_hlsjs.html`
* Pour lire du contenu DASH : `http://<ip_du_serveur>:8080/players/dash.html`

## Copyright
Publié sous la licence MIT.

## Déploiement
lien de récupération RTMP : `rg.fr-par.scw.cloud/rtmp-server-images/octocast_rtmp_server:latest`