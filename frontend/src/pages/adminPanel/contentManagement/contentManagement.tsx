import { FC, useEffect, useState, useCallback } from 'react';
import styles from './contentManagement.module.css';
import { useTranslation } from 'react-i18next';
import Card from '../../../components/ReworkComponents/generic/Cards/Card';
import Toast from '../../../components/ReworkComponents/generic/Toast/Toast';
import Button, {
  ButtonType,
} from '../../../components/ReworkComponents/generic/Button/Button';
import { useUser } from '../../../context/UserContext';
import NotFoundPage from '../../notFound/notFound';
import { api } from '../../../utils/api';

interface Tag {
  id: string;
  name: string;
}

interface Speaker {
  id: string;
  username: string;
}

interface Comment {
  id: string;
  content: string;
}

interface VideoData {
  id: string;
  title: string;
  description: string;
  creator: {
    id: string;
    username: string;
  };
  createdAt: string;
  archived: boolean;
  views: number;
  media_id?: string;
  miniature_id?: string;
  tags?: Tag[];
  internal_speakers?: Speaker[];
  external_speakers?: string;
  comments?: Comment[];
  updatedAt?: string;
}

export interface ContentManagementProps {}

const ContentManagement: FC<ContentManagementProps> = () => {
  const { isAdmin } = useUser();
  const { t } = useTranslation();
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [filteredVideos, setFilteredVideos] = useState<VideoData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filter, setFilter] = useState<'all' | 'archived' | 'active'>('all');
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const fetchVideos = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/videos/all');
      if (response.ok && response.data) {
        setVideos(Array.isArray(response.data) ? response.data : []);
      } else {
        setToast({
          message: t('errorLoadingVideos'),
          type: 'error',
        });
      }
    } catch (error) {
      console.error('Error fetching videos:', error);
      setToast({
        message: t('errorLoadingVideos'),
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  const applyFilter = useCallback(() => {
    if (filter === 'all') {
      setFilteredVideos(videos);
    } else if (filter === 'archived') {
      setFilteredVideos(videos.filter((v) => v.archived));
    } else {
      setFilteredVideos(videos.filter((v) => !v.archived));
    }
  }, [filter, videos]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  useEffect(() => {
    applyFilter();
  }, [applyFilter]);

  const handleDeletePermanently = async (videoId: string) => {
    if (!window.confirm(t('confirmPermanentDelete'))) {
      return;
    }

    try {
      const response = await api.delete(`/videos/admin/${videoId}`);

      if (response.ok) {
        setToast({
          message: t('videoDeletedSuccess'),
          type: 'success',
        });
        fetchVideos();
      } else {
        setToast({
          message: t('videoDeleteError'),
          type: 'error',
        });
      }
    } catch (error) {
      console.error('Error deleting video:', error);
      setToast({
        message: t('videoDeleteError'),
        type: 'error',
      });
    }
  };

  const modifyVideoArchiveStatus = async (
    videoId: string,
    archived: boolean,
  ) => {
    if (archived === true) {
      try {
        const response = await api.delete(`/videos/${videoId}`);

        if (response.ok) {
          setToast({
            message: t('videoArchivedSuccess'),
            type: 'success',
          });
          fetchVideos();
        } else {
          setToast({
            message: t('videoArchiveError'),

            type: 'error',
          });
        }
      } catch (error) {
        console.error('Error archive video:', error);

        setToast({
          message: t('videoArchiveError'),
          type: 'error',
        });
      }
    } else {
      try {
        const response = await api.post(`/videos/restore/${videoId}`);
        if (response.ok) {
          setToast({
            message: t('videoRestoredSuccess'),
            type: 'success',
          });
          fetchVideos();
        } else {
          setToast({
            message: t('videoRestoreError'),
            type: 'error',
          });
        }
      } catch (error) {
        console.error('Error restoring video:', error);
        setToast({
          message: t('videoRestoreError'),
          type: 'error',
        });
      }
    }
  };

  const handleArchive = async (videoId: string) => {
    await modifyVideoArchiveStatus(videoId, true);
  };

  const handleRestore = async (videoId: string) => {
    await modifyVideoArchiveStatus(videoId, false);
  };

  if (!isAdmin) {
    return <NotFoundPage />;
  }

  return (
    <div className={styles.contentManagement}>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      <div className={styles.header}>
        <h1 className={styles.title}>{t('contentManagement')}</h1>
      </div>

      <div className={styles.content}>
        <Card>
          <div className={styles.cardContent}>
            <div className={styles.filterSection}>
              <h2>{t('videoManagement')}</h2>
              <div className={styles.filterButtons}>
                <Button
                  label={t('all')}
                  type={
                    filter === 'all' ? ButtonType.primary : ButtonType.secondary
                  }
                  onClick={() => setFilter('all')}
                />
                <Button
                  label={t('active')}
                  type={
                    filter === 'active'
                      ? ButtonType.primary
                      : ButtonType.secondary
                  }
                  onClick={() => setFilter('active')}
                />
                <Button
                  label={t('archived')}
                  type={
                    filter === 'archived'
                      ? ButtonType.primary
                      : ButtonType.secondary
                  }
                  onClick={() => setFilter('archived')}
                />
              </div>
            </div>

            {loading ? (
              <div className={styles.loading}>{t('loading')}</div>
            ) : (
              <div className={styles.tableContainer}>
                <table className={styles.videoTable}>
                  <thead>
                    <tr>
                      <th>{t('title')}</th>
                      <th>{t('creator')}</th>
                      <th>{t('createdAt')}</th>
                      <th>{t('views')}</th>
                      <th>{t('status')}</th>
                      <th>{t('actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVideos.length === 0 ? (
                      <tr>
                        <td colSpan={6} className={styles.noData}>
                          {t('noVideosFound')}
                        </td>
                      </tr>
                    ) : (
                      filteredVideos.map((video) => (
                        <tr key={video.id}>
                          <td className={styles.titleCell}>{video.title}</td>
                          <td>{video.creator?.username || t('unknown')}</td>
                          <td>
                            {new Date(video.createdAt).toLocaleDateString()}
                          </td>
                          <td>{video.views}</td>
                          <td>
                            <span
                              className={
                                video.archived
                                  ? styles.statusArchived
                                  : styles.statusActive
                              }
                            >
                              {video.archived ? t('archived') : t('active')}
                            </span>
                          </td>
                          <td className={styles.actionsCell}>
                            {video.archived ? (
                              <Button
                                label={t('restore')}
                                type={ButtonType.secondary}
                                onClick={() => handleRestore(video.id)}
                              />
                            ) : (
                              <Button
                                label={t('archiveVideo')}
                                type={ButtonType.secondary}
                                onClick={() => handleArchive(video.id)}
                              />
                            )}
                            <Button
                              label={t('deletePermanently')}
                              type={ButtonType.danger}
                              onClick={() => handleDeletePermanently(video.id)}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ContentManagement;
