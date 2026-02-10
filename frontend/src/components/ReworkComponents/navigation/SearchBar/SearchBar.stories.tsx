import type { Meta, StoryObj } from '@storybook/react';
import SearchBar, { SearchBarIcon } from './SearchBar';
import '../../../../index.css';

const meta = {
  title: 'navigation/SearchBar',
  component: SearchBar,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    onClick: { action: 'clicked' },
  },
} satisfies Meta<typeof SearchBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: 'Search for something...',
    onClick: () => {
      alert('click !');
    },
  },
};

export const AddIcon: Story = {
  args: {
    icon: SearchBarIcon.ADD,
    placeholder: 'Add new item...',
    onClick: () => {
      alert('click !');
    },
  },
};

export const NoInput: Story = {
  args: {
    needInput: false,
    onClick: () => {
      alert('click !');
    },
  },
};

export const NoSuggestions: Story = {
  args: {
    hasSugestion: false,
    placeholder: 'Search without suggestions',
    onClick: () => {
      alert('click !');
    },
  },
};
