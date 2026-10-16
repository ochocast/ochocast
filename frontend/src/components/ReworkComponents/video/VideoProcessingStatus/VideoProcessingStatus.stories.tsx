import type { Meta, StoryObj } from '@storybook/react';
import VideoProcessingStatus from './VideoProcessingStatus';
import '../../../../index.css';

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60000).toISOString();

const meta = {
  title: 'Video/VideoProcessingStatus',
  component: VideoProcessingStatus,
  decorators: [
    (Story) => (
      <div style={{ width: 720, maxWidth: '100%', background: '#050505' }}>
        <Story />
      </div>
    ),
  ],
  tags: ['autodocs'],
  args: {
    status: {
      state: 'queued',
      since: null,
      reason: null,
      playedFromSource: false,
    },
  },
} satisfies Meta<typeof VideoProcessingStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Queued: Story = {};

export const Processing: Story = {
  args: {
    status: {
      state: 'processing',
      since: minutesAgo(12),
      reason: null,
      playedFromSource: false,
    },
  },
};

export const Retrying: Story = {
  args: {
    status: {
      state: 'retrying',
      since: null,
      reason: null,
      playedFromSource: false,
    },
  },
};

export const FailedForVisitors: Story = {
  args: {
    status: {
      state: 'failed',
      since: null,
      reason: 'source_too_large',
      playedFromSource: false,
    },
  },
};

export const FailedForTheCreator: Story = {
  args: { ...FailedForVisitors.args, isCreator: true },
};
