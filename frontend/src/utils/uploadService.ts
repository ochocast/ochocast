/**
 * Service d'upload de vidéo avec suivi de progression
 * Utilise XMLHttpRequest pour permettre le tracking de la progression
 */

export interface UploadProgressCallback {
  onProgress: (progress: number) => void;
  onComplete: (response: { id: string }) => void;
  onError: (error: string) => void;
}

/**
 * Upload une vidéo avec suivi de progression
 * @param formData - Les données du formulaire contenant la vidéo et les métadonnées
 * @param callbacks - Callbacks pour suivre la progression
 * @returns Une fonction pour annuler l'upload
 */
export function uploadVideoWithProgress(
  formData: FormData,
  callbacks: UploadProgressCallback,
): () => void {
  const xhr = new XMLHttpRequest();
  const baseUrl = `${process.env.REACT_APP_API_URL}:${process.env.REACT_APP_API_PORT}/api`;

  // Récupérer le token d'authentification
  const userString = localStorage.getItem('backendUser');
  const user = userString ? JSON.parse(userString) : null;

  // Vérifier que le token existe avant de lancer l'upload
  if (!user?.token) {
    console.error('Upload Service: No authentication token found');
    callbacks.onError('Session expirée. Veuillez vous reconnecter.');
    return () => {};
  }

  console.log(
    'Upload Service: Starting upload with token:',
    user.token.substring(0, 20) + '...',
  );

  xhr.open('POST', `${baseUrl}/videos/`, true);

  // Ajouter le header d'authentification
  xhr.setRequestHeader('Authorization', `Bearer ${user.token}`);

  // Suivre la progression de l'upload
  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable) {
      const progress = Math.round((event.loaded / event.total) * 100);
      callbacks.onProgress(progress);
    }
  };

  // Gérer la réponse
  xhr.onload = () => {
    console.log('Upload Service: Response status:', xhr.status);
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        const response = JSON.parse(xhr.responseText);
        callbacks.onComplete(response);
      } catch {
        callbacks.onComplete({ id: xhr.responseText });
      }
    } else if (xhr.status === 401) {
      console.error('Upload Service: Unauthorized - Token may be expired');
      callbacks.onError('Session expirée. Veuillez vous reconnecter.');
    } else if (xhr.status === 403) {
      console.error('Upload Service: Forbidden');
      callbacks.onError('Accès refusé. Permissions insuffisantes.');
    } else {
      let errorMessage = `Erreur ${xhr.status} lors du téléversement`;
      try {
        const errorResponse = JSON.parse(xhr.responseText);
        errorMessage = errorResponse.message || errorMessage;
      } catch {
        // Ignorer l'erreur de parsing
      }
      callbacks.onError(errorMessage);
    }
  };

  // Gérer les erreurs réseau
  xhr.onerror = () => {
    callbacks.onError('Erreur réseau lors du téléversement');
  };

  // Gérer le timeout
  xhr.ontimeout = () => {
    callbacks.onError('Le téléversement a expiré');
  };

  // Ne pas définir de timeout pour les gros fichiers
  // xhr.timeout = 0 signifie pas de timeout
  xhr.timeout = 0;

  // Envoyer le formulaire
  xhr.send(formData);

  // Retourner une fonction pour annuler l'upload
  return () => {
    xhr.abort();
  };
}
