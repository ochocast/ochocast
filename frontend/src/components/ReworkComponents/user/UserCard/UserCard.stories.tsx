import type { Meta, StoryObj } from '@storybook/react';
import UserCard from './UserCard';
import '../../../../index.css';

const meta = {
  title: 'User/UserCard',
  component: UserCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof UserCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    id: '1',
    firstName: 'John',
    lastName: 'Doe',
    username: 'johndoe',
    description: 'A passionate developer who loves React and Storybook.',
  },
};

export const LongDescription: Story = {
  args: {
    id: '2',
    firstName: 'Jane',
    lastName: 'Smith',
    username: 'janesmith',
    description:
      'This is a very long description to test the truncation logic in the UserCard component. It should show a "voir plus" text at the end if it exceeds the maximum allowed length of one hundred characters.',
  },
};

export const NoUsername: Story = {
  args: {
    id: '3',
    firstName: 'Only',
    lastName: 'Names',
    username: '',
    description: 'Testing how it looks without a username.',
  },
};
