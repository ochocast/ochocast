import type { Meta, StoryObj } from '@storybook/react';
import FilterPanel from './FilterPanel';
import '../../../../index.css';

const meta = {
  title: 'navigation/FilterPanel',
  component: FilterPanel,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    onTagsChange: { action: 'tagsChanged' },
    onUsersChange: { action: 'usersChanged' },
    onDateFilter: { action: 'dateFiltered' },
    closePanel: { action: 'closed' },
    onResetFilters: { action: 'filtersReset' },
    onCardsPerRowChange: { action: 'cardsPerRowChanged' },
  },
} satisfies Meta<typeof FilterPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const defaultFunction = () => {};

export const Default: Story = {
  args: {
    initialTags: ['React', 'TypeScript'],
    initialUsers: ['John'],
    initialStartDate: null,
    initialEndDate: null,
    onTagsChange: defaultFunction,
    onUsersChange: defaultFunction,
    onDateFilter: defaultFunction,
    closePanel: defaultFunction,
  },
};

export const WithDates: Story = {
  args: {
    initialTags: [],
    initialUsers: [],
    initialStartDate: new Date('2025-01-01'),
    initialEndDate: new Date('2025-12-31'),
    onTagsChange: defaultFunction,
    onUsersChange: defaultFunction,
    onDateFilter: defaultFunction,
    closePanel: defaultFunction,
  },
};

export const WithCardsPerRow: Story = {
  args: {
    initialTags: ['React'],
    initialUsers: [],
    initialStartDate: null,
    initialEndDate: null,
    initialCardsPerRow: 7,
    onTagsChange: defaultFunction,
    onUsersChange: defaultFunction,
    onDateFilter: defaultFunction,
    closePanel: defaultFunction,
    onCardsPerRowChange: defaultFunction,
  },
};
