import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useEffect,
  useRef,
} from 'react';
import { useTranslation } from 'react-i18next';
import { fetchVideoProcessing, nextPollDelay } from '../utils/videoProcessing';
import { processingUploadUpdate } from './uploadProcessing';

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
  sessionId?: string;
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
            errorMessage:
              'Envoi interrompu. Resélectionnez le même fichier pour reprendre les parties restantes.',
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
  const { t } = useTranslation();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const previousUploadsRef = useRef<UploadItem[]>([]);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const processingPollRef = useRef(
    new Map<string, { nextAt: number; attempt: number }>(),
  );
  const uploadsRef = useRef(uploads);
  useEffect(() => {
    uploadsRef.current = uploads;
  }, [uploads]);

  // Sauvegarder les uploads dans localStorage quand ils changent
  useEffect(() => {
    localStorage.setItem(UPLOADS_STORAGE_KEY, serializeUploads(uploads));
  }, [uploads]);

  // Sauvegarder l'état du panel
  useEffect(() => {
    localStorage.setItem(PANEL_STATE_KEY, String(isPanelOpen));
  }, [isPanelOpen]);

  // Suivre le traitement des vidéos envoyées (y compris après un reload)
  useEffect(() => {
    let checking = false;
    let cancelled = false;
    const checkProcessingVideos = async () => {
      // Hidden tab: wait, the next visible tick checks right away.
      if (checking || document.hidden) return;
      checking = true;
      try {
        const processingUploads = uploadsRef.current.filter(
          (upload) => upload.status === 'processing' && upload.videoId,
        );
        for (const upload of processingUploads) {
          const now = Date.now();
          const poll = processingPollRef.current.get(upload.id) || {
            nextAt: 0,
            attempt: 0,
          };
          if (poll.nextAt > now) continue;
          const result = await fetchVideoProcessing(upload.videoId!);
          if (cancelled) return;
          const update: Partial<UploadItem> | null =
            result.kind === 'not_found'
              ? {
                  status: 'error',
                  errorMessage: tRef.current('uploadVideoGone'),
                }
              : result.kind === 'status'
                ? processingUploadUpdate(result.status, tRef.current)
                : null;
          if (!update) {
            // queued, processing, retrying or unreachable: ask again later.
            processingPollRef.current.set(upload.id, {
              nextAt: now + nextPollDelay(poll.attempt),
              attempt: poll.attempt + 1,
            });
            continue;
          }
          processingPollRef.current.delete(upload.id);
          setUploads((prev) =>
            prev.map((u) =>
              u.id === upload.id && u.status === 'processing'
                ? { ...u, ...update }
                : u,
            ),
          );
        }
        const activeIds = new Set(processingUploads.map((upload) => upload.id));
        for (const uploadId of processingPollRef.current.keys()) {
          if (!activeIds.has(uploadId))
            processingPollRef.current.delete(uploadId);
        }
      } finally {
        checking = false;
      }
    };

    // Vérifier immédiatement au montage
    void checkProcessingVideos();

    // Puis toutes les 5 secondes ; chaque vidéo a son propre délai (5 s → 30 s)
    checkIntervalRef.current = setInterval(() => {
      void checkProcessingVideos();
    }, 5000);

    return () => {
      cancelled = true;
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

      // Video processed and online
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
            message: tRef.current('uploadVideoOnline'),
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
            message: upload.errorMessage || tRef.current('uploadFailed'),
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
