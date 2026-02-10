import type { Meta, StoryObj } from '@storybook/react';
import TrackBox from './TrackBox';
import '../../../../../index.css';
import { Track } from '@/utils/EventsProperties';

const mockTrack: Track = {
  id: '1',
  name: 'Sample Track',
  description: 'This is a sample track description.',
  keywords: 'tech, web',
  streamKey: 'sample-key',
  closed: false,
  speakers: [
    { id: '1', firstName: 'John', lastName: 'Doe' },
    { id: '2', firstName: 'Jane', lastName: 'Smith' },
  ],
  createdAt: new Date(),
  startDate: new Date(),
  endDate: new Date(Date.now() + 3600000),
  event: {
    id: '',
    name: '',
    description: '',
    tags: [],
    startDate: new Date(),
    endDate: new Date(),
    published: false,
    private: false,
    closed: false,
    imageSlug: '',
    tracks: [],
    creatorId: '',
    canBeEditByUser: false,
    creator: {
      id: '',
      firstName: '',
      lastName: '',
    },
    nbSubscription: 0,
  },
};

const meta = {
  title: 'Event/TrackBox',
  component: TrackBox,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    key: 1,
  },
} satisfies Meta<typeof TrackBox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    track: mockTrack,
  },
};

export const Closed: Story = {
  args: {
    track: { ...mockTrack, closed: true },
  },
};
