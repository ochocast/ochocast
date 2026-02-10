import type { Meta, StoryObj } from '@storybook/react';
import LoadingCircle from './LoadingCircle';
import '../../../index.css';

const meta = {
  title: 'generic/LoadingCircle',
  component: LoadingCircle,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof LoadingCircle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
