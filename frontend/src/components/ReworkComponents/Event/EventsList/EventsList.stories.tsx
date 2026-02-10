import type { Meta, StoryObj } from '@storybook/react';
import EventsList from './EventsList';
import '../../../../index.css';
import { EventStatus } from '../../../../utils/EventStatus';
import { PublicEvent } from '@/utils/EventsProperties';

const mockEvents = [
  {
    id: '1',
    name: 'Tech Conference 2025',
    description: 'The biggest tech conference of the year.',
    tags: [{ id: '1', name: 'Tech' }],
    startDate: new Date(),
    endDate: new Date(Date.now() + 3600000),
    published: true,
    private: false,
    closed: false,
    imageSlug: 'tech-2025',
    tracks: [],
    creatorId: '1',
    canBeEditByUser: true,
    creator: { id: '1', firstName: 'John', lastName: 'Doe' },
    nbSubscription: 150,
  },
  {
    id: '2',
    name: 'Web Dev Workshop',
    description: 'Learn React and Storybook.',
    tags: [{ id: '2', name: 'Web' }],
    startDate: new Date(),
    endDate: new Date(Date.now() + 7200000),
    published: true,
    private: false,
    closed: false,
    imageSlug: 'web-dev',
    tracks: [],
    creatorId: '2',
    canBeEditByUser: true,
    creator: { id: '2', firstName: 'Jane', lastName: 'Smith' },
    nbSubscription: 45,
  },
  {
    id: '3',
    name: 'Cloud Summit',
    description: 'Scaling to the moon.',
    tags: [{ id: '3', name: 'Cloud' }],
    startDate: new Date(),
    endDate: new Date(Date.now() + 10800000),
    published: true,
    private: false,
    closed: false,
    imageSlug: 'cloud',
    tracks: [],
    creatorId: '3',
    canBeEditByUser: true,
    creator: { id: '3', firstName: 'Bob', lastName: 'Wilson' },
    nbSubscription: 89,
  },
  {
    id: '4',
    name: 'AI Discussion',
    description: 'The future of AI.',
    tags: [{ id: '4', name: 'AI' }],
    startDate: new Date(),
    endDate: new Date(Date.now() + 14400000),
    published: true,
    private: false,
    closed: false,
    imageSlug: 'ai',
    tracks: [],
    creatorId: '4',
    canBeEditByUser: true,
    creator: { id: '4', firstName: 'Alice', lastName: 'Johnson' },
    nbSubscription: 200,
  },
];

const meta = {
  title: 'Event/EventsList',
  component: EventsList,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof EventsList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Upcoming Events',
    eventStatus: EventStatus.Published,
    events: mockEvents as PublicEvent[],
  },
};

export const SmallList: Story = {
  args: {
    title: 'Few Events',
    eventStatus: EventStatus.Published,
    events: mockEvents.slice(0, 2) as PublicEvent[],
  },
};
