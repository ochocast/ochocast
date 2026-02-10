import type { Meta, StoryObj } from '@storybook/react';
import SideSearchBar from './SideSearchBar';
import '../../../../../index.css';

const meta = {
  title: 'video/navigation/SideSearchBar',
  component: SideSearchBar,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    onSearch: { action: 'searched' },
  },
} satisfies Meta<typeof SideSearchBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    tags: [
      { id: '1', name: 'React' },
      { id: '2', name: 'TypeScript' },
    ],
    users: [
      {
        id: '1',
        username: 'johndoe',
        firstName: 'John',
        lastName: 'Doe',
        role: 'user',
        email: 'john@example.com',
        createdAt: new Date(),
        description: '',
        picture_id: '',
      },
    ],
    onSearch: () => {},
  },
};
