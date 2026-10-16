import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import '../../../index.css';
import UploadPanel from './UploadPanel';
import UploadNotifications from '../UploadNotifications/UploadNotifications';
import {
  UploadContext,
  UploadContextType,
  UploadItem,
  UploadNotification,
} from '../../../context/UploadContext';

const now = new Date();

const uploads: UploadItem[] = [
  {
    id: 'uploading',
    fileName: 'conference-keynote.mp4',
    title: 'Keynote d’ouverture',
    progress: 62,
    status: 'uploading',
    createdAt: now,
  },
  {
    id: 'processing',
    fileName: 'atelier-react.mp4',
    title: 'Atelier React',
    progress: 100,
    status: 'processing',
    videoId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    createdAt: now,
  },
  {
    id: 'completed',
    fileName: 'table-ronde.mp4',
    title: 'Table ronde',
    progress: 100,
    status: 'completed',
    videoId: '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
    createdAt: now,
  },
  {
    id: 'failed',
    fileName: 'archive.avi',
    title: 'Archive 2019',
    progress: 100,
    status: 'error',
    videoId: '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b',
    errorMessage:
      'Le fichier vidéo est illisible. Importez un autre fichier, par exemple en MP4.',
    createdAt: now,
  },
];

const notifications: UploadNotification[] = [
  {
    id: 'online',
    title: 'Votre vidéo est en ligne',
    message: 'Table ronde',
    type: 'success',
    videoId: '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
  },
];

const mockContext = (
  items: UploadItem[],
  toasts: UploadNotification[] = [],
): UploadContextType => ({
  uploads: items,
  isPanelOpen: true,
  notifications: toasts,
  addUpload: () => {},
  updateUpload: () => {},
  removeUpload: () => {},
  clearCompleted: () => {},
  openPanel: () => {},
  closePanel: () => {},
  togglePanel: () => {},
  dismissNotification: () => {},
  getUploadById: (id) => items.find((upload) => upload.id === id),
});

const meta = {
  title: 'Upload/UploadPanel',
  component: UploadPanel,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof UploadPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const EveryState: Story = {
  render: () => (
    <UploadContext.Provider value={mockContext(uploads, notifications)}>
      <div style={{ minHeight: '100vh' }}>
        <UploadPanel />
        <UploadNotifications />
      </div>
    </UploadContext.Provider>
  ),
};

export const Processing: Story = {
  render: () => (
    <UploadContext.Provider
      value={mockContext(uploads.filter((u) => u.status === 'processing'))}
    >
      <div style={{ minHeight: '100vh' }}>
        <UploadPanel />
      </div>
    </UploadContext.Provider>
  ),
};
