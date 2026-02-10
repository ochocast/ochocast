import type { Meta, StoryObj } from '@storybook/react';
import MenuTracks from './MenuTracks';
import '../../../../../index.css';
import { Track } from '@/utils/EventsProperties';

const mockTracks = [
  { id: '1', name: 'Track 1 - Introduction' },
  { id: '2', name: 'Track 2 - Advanced Topics' },
  { id: '3', name: 'Track 3 - Q&A Session' },
];

const meta = {
  title: 'Event/Track/MenuTracks',
  component: MenuTracks,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof MenuTracks>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    tracks: mockTracks as unknown as Track[],
    eventId: '1',
    imageUrl: '',
    isButtonDisplayed: true,
  },
};

export const WithoutAddButton: Story = {
  args: {
    tracks: mockTracks as Track[],
    eventId: '1',
    imageUrl: '',
    isButtonDisplayed: false,
  },
};
