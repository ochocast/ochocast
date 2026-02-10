import type { Meta, StoryObj } from '@storybook/react';
import CommentBar from './CommentBar';
import '../../../../../index.css';

const meta = {
  title: 'Video/Comments/CommentBar',
  component: CommentBar,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    onSubmit: { action: 'submitted' },
  },
} satisfies Meta<typeof CommentBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onSubmit: () => {},
  },
};
