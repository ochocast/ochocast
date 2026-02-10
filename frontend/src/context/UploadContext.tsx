import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useEffect,
  useRef,
} from 'react';

export type UploadStatus =
  | 'pending'
  | 'uploading'
  | 'processing'
  | 'completed'
  | 'error';

export interface UploadItem {
  id: string;
  fileName: string;
  title: string;
  progress: number; // 0-100
  status: UploadStatus;
  errorMessage?: string;
  videoId?: string; // ID de la vidéo créée après succès
  createdAt: Date;
  formData?: FormData; // Stocker les données pour retry
}

export interface UploadNotification {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'error';
  videoId?: string;
  uploadId?: string; // Pour le retry
}

interface UploadContextType {
  uploads: UploadItem[];
  isPanelOpen: boolean;
  notifications: UploadNotification[];
  addUpload: (upload: Omit<UploadItem, 'createdAt'>) => void;
  updateUpload: (id: string, updates: Partial<UploadItem>) => void;
  removeUpload: (id: string) => void;
  clearCompleted: () => void;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  dismissNotification: (id: string) => void;
  retryUpload: (id: string) => void;
  getUploadById: (id: string) => UploadItem | undefined;
}

const UploadContext = createContext<UploadContextType | null>(null);

const UPLOADS_STORAGE_KEY = 'ochocast_uploads';
const PANEL_STATE_KEY = 'ochocast_upload_panel_open';

// Helper pour sérialiser les uploads (sans FormData qui n'est pas sérialisable)
const serializeUploads = (uploads: UploadItem[]): string => {
  const serializable = uploads.map(({ formData, createdAt, ...rest }) => ({
    ...rest,
    createdAt: createdAt instanceof Date ? createdAt.toISOString() : createdAt,
  }));
  return JSON.stringify(serializable);
};

// Helper pour désérialiser les uploads
const deserializeUploads = (data: string): UploadItem[] => {
  try {
    const parsed = JSON.parse(data);
    return parsed.map(
      (item: Omit<UploadItem, 'createdAt'> & { createdAt: string }) => ({
        ...item,
        createdAt: new Date(item.createdAt),
      }),
    );
  } catch {
    return [];
  }
};

// Charger l'état initial depuis localStorage
const loadInitialState = (): {
  uploads: UploadItem[];
  isPanelOpen: boolean;
} => {
  try {
    const uploadsData = localStorage.getItem(UPLOADS_STORAGE_KEY);
    const panelState = localStorage.getItem(PANEL_STATE_KEY);

    let uploads: UploadItem[] = [];
    if (uploadsData) {
      uploads = deserializeUploads(uploadsData);

      // Filtrer les uploads terminés - ils ne doivent plus apparaître après reload
      uploads = uploads.filter((upload) => upload.status !== 'completed');

      // Garder les uploads en cours de traitement (processing)
      // Les uploads "uploading" sont marqués comme erreur car la connexion est perdue
      uploads = uploads.map((upload) => {
        if (upload.status === 'uploading') {
          return {
            ...upload,
            status: 'error' as UploadStatus,
            errorMessage: 'Upload interrompu (page rechargée)',
          };
        }
        // Les uploads en 'processing' restent en processing car le backend continue le traitement
        return upload;
      });
    }

    return {
      uploads,
      isPanelOpen: panelState === 'true',
    };
  } catch {
    return { uploads: [], isPanelOpen: false };
  }
};

export function UploadProvider({ children }: { children: ReactNode }) {
  const initialState = loadInitialState();
  const [uploads, setUploads] = useState<UploadItem[]>(initialState.uploads);
  const [isPanelOpen, setIsPanelOpen] = useState(initialState.isPanelOpen);
  const [notifications, setNotifications] = useState<UploadNotification[]>([]);
  const previousUploadsRef = useRef<UploadItem[]>([]);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Sauvegarder les uploads dans localStorage quand ils changent
  useEffect(() => {
    localStorage.setItem(UPLOADS_STORAGE_KEY, serializeUploads(uploads));
  }, [uploads]);

  // Sauvegarder l'état du panel
  useEffect(() => {
    localStorage.setItem(PANEL_STATE_KEY, String(isPanelOpen));
  }, [isPanelOpen]);

  // Vérifier les vidéos en processing après un reload
  useEffect(() => {
    const checkProcessingVideos = async () => {
      setUploads((currentUploads) => {
        const processingUploads = currentUploads.filter(
          (upload) => upload.status === 'processing',
        );

        if (processingUploads.length === 0) {
          return currentUploads;
        }

        // Vérifier chaque vidéo en processing de manière asynchrone
        processingUploads.forEach(async (upload) => {
          try {
            const baseUrl = `${process.env.REACT_APP_API_URL}:${process.env.REACT_APP_API_PORT}/api`;
            const userString = localStorage.getItem('backendUser');
            const user = userString ? JSON.parse(userString) : null;

            if (!user?.token) return;

            let videoFound = false;
            let videoData: { id: string } | null = null;

            // Si on a le videoId, vérifier directement
            if (upload.videoId) {
              const response = await fetch(
                `${baseUrl}/videos?id=${upload.videoId}`,
                {
                  headers: {
                    Authorization: `Bearer ${user.token}`,
                  },
                },
              );

              if (response.ok) {
                const data = await response.json();
                if (data && data.length > 0) {
                  videoFound = true;
                  videoData = data[0];
                }
              }
            }
            // Sinon, chercher par titre
            else if (upload.title) {
              const response = await fetch(
                `${baseUrl}/videos?title=${encodeURIComponent(upload.title)}`,
                {
                  headers: {
                    Authorization: `Bearer ${user.token}`,
                  },
                },
              );

              if (response.ok) {
                const data = await response.json();
                if (data && data.length > 0) {
                  videoFound = true;
                  videoData = data[0];
                }
              }
            }

            // Si la vidéo est trouvée, la marquer comme terminée
            if (videoFound && videoData !== null) {
              const foundVideoId = videoData.id;
              setUploads((prev) =>
                prev.map((u) =>
                  u.id === upload.id
                    ? {
                        ...u,
                        status: 'completed' as UploadStatus,
                        progress: 100,
                        videoId: foundVideoId,
                      }
                    : u,
                ),
              );
            }
          } catch (error) {
            console.error('Error checking video status:', error);
            // En cas d'erreur, on garde l'état processing
          }
        });

        return currentUploads;
      });
    };

    // Vérifier immédiatement au montage
    void checkProcessingVideos();

    // Puis vérifier toutes les 5 secondes s'il y a des vidéos en processing
    checkIntervalRef.current = setInterval(() => {
      void checkProcessingVideos();
    }, 5000);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, []); // Pas de dépendance pour ne créer l'intervalle qu'une fois

  // Watch for status changes to trigger notifications
  useEffect(() => {
    const previousUploads = previousUploadsRef.current;

    uploads.forEach((upload) => {
      const prevUpload = previousUploads.find((u) => u.id === upload.id);

      // Upload just completed
      if (
        prevUpload &&
        prevUpload.status !== 'completed' &&
        upload.status === 'completed'
      ) {
        setNotifications((prev) => [
          ...prev,
          {
            id: upload.id,
            title: upload.title,
            message: 'Vidéo téléversée avec succès !',
            type: 'success',
            videoId: upload.videoId,
          },
        ]);
      }

      // Upload just failed
      if (
        prevUpload &&
        prevUpload.status !== 'error' &&
        upload.status === 'error'
      ) {
        setNotifications((prev) => [
          ...prev,
          {
            id: upload.id,
            title: upload.title,
            message: upload.errorMessage || 'Échec du téléversement',
            type: 'error',
          },
        ]);
      }
    });

    previousUploadsRef.current = uploads;
  }, [uploads]);

  const addUpload = useCallback((upload: Omit<UploadItem, 'createdAt'>) => {
    setUploads((prev) => [
      ...prev,
      {
        ...upload,
        createdAt: new Date(),
      },
    ]);
    // Ouvrir automatiquement le panneau quand on ajoute un upload
    setIsPanelOpen(true);
  }, []);

  const updateUpload = useCallback(
    (id: string, updates: Partial<UploadItem>) => {
      setUploads((prev) =>
        prev.map((upload) =>
          upload.id === id ? { ...upload, ...updates } : upload,
        ),
      );
    },
    [],
  );

  const removeUpload = useCallback((id: string) => {
    setUploads((prev) => prev.filter((upload) => upload.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setUploads((prev) =>
      prev.filter((upload) => upload.status !== 'completed'),
    );
  }, []);

  const openPanel = useCallback(() => setIsPanelOpen(true), []);
  const closePanel = useCallback(() => setIsPanelOpen(false), []);
  const togglePanel = useCallback(() => setIsPanelOpen((prev) => !prev), []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const getUploadById = useCallback(
    (id: string) => {
      return uploads.find((u) => u.id === id);
    },
    [uploads],
  );

  const retryUpload = useCallback((id: string) => {
    // Reset the upload status to pending - the actual retry logic
    // will be handled by the component that calls this
    setUploads((prev) =>
      prev.map((upload) =>
        upload.id === id
          ? {
              ...upload,
              status: 'pending' as UploadStatus,
              progress: 0,
              errorMessage: undefined,
            }
          : upload,
      ),
    );
  }, []);

  return (
    <UploadContext.Provider
      value={{
        uploads,
        isPanelOpen,
        notifications,
        addUpload,
        updateUpload,
        removeUpload,
        clearCompleted,
        openPanel,
        closePanel,
        togglePanel,
        dismissNotification,
        retryUpload,
        getUploadById,
      }}
    >
      {children}
    </UploadContext.Provider>
  );
}

export function useUploadContext(): UploadContextType {
  const context = useContext(UploadContext);
  if (context === null) {
    throw new Error('useUploadContext must be used within an UploadProvider');
  }
  return context;
}
