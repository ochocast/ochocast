import type { Meta, StoryObj } from '@storybook/react';
import EventBox from './EventBox';
import '../../../../index.css';
import { EventStatus } from '../../../../utils/EventStatus';
import { PublicEvent } from '@/utils/EventsProperties';

const mockEvent = {
  id: '1',
  name: 'Sample Event',
  description: 'This is a sample event description.',
  tags: [
    { id: '1', name: 'Tech' },
    { id: '2', name: 'Web' },
  ],
  startDate: new Date(),
  endDate: new Date(Date.now() + 3600000),
  published: true,
  private: false,
  closed: false,
  imageSlug: 'sample-image',
  tracks: [],
  creatorId: '1',
  canBeEditByUser: true,
  creator: {
    id: '1',
    firstName: 'John',
    lastName: 'Doe',
  },
  nbSubscription: 10,
  subscribedUserIds: ['2'],
};

const meta = {
  title: 'Event/EventBox',
  component: EventBox,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof EventBox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Published: Story = {
  args: {
    event: mockEvent as PublicEvent,
    eventStatus: EventStatus.Published,
  },
};

export const NotPublished: Story = {
  args: {
    event: { ...mockEvent, published: false } as PublicEvent,
    eventStatus: EventStatus.NotPublished,
  },
};

export const Finished: Story = {
  args: {
    event: mockEvent as PublicEvent,
    eventStatus: EventStatus.Finished,
  },
};

export const Organizer: Story = {
  args: {
    event: { ...mockEvent, creatorId: '1' } as PublicEvent, // ID 1 matches mockUser.id in StorybookDecorators
    eventStatus: EventStatus.Published,
  },
};
