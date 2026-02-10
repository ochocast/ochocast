import type { Meta, StoryObj } from '@storybook/react';
import FilterSearchBar, { FilterSearchBarIcon } from './FilterSearchBar';
import '../../../../index.css';

const meta = {
  title: 'navigation/FilterSearchBar',
  component: FilterSearchBar,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    onClick: { action: 'clicked' },
    onSelect: { action: 'selected' },
  },
} satisfies Meta<typeof FilterSearchBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TagSearch: Story = {
  args: {
    type: 'tag',
    placeholder: 'Search tags...',
    onClick: () => {
      alert('click !');
    },
  },
};

export const UserSearch: Story = {
  args: {
    type: 'user',
    placeholder: 'Search users...',
    onClick: () => {
      alert('click !');
    },
  },
};

export const AddIcon: Story = {
  args: {
    type: 'tag',
    icon: FilterSearchBarIcon.ADD,
    placeholder: 'Add tag...',
    onClick: () => {
      alert('click !');
    },
  },
};
