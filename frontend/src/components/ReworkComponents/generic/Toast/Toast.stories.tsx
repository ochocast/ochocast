import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import Toast from './Toast';
import '../../../../index.css';

const meta: Meta<typeof Toast> = {
  title: 'feedback/Toast',
  component: Toast,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    type: {
      options: ['success', 'error', 'info'],
      control: { type: 'radio' },
    },
    duration: {
      control: { type: 'number' },
    },
    message: {
      control: { type: 'text' },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const ToastWrapper = (args: {
  message?: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
}) => {
  const [visible, setVisible] = useState(true);

  if (!visible || !args.message) return null;

  return (
    <Toast {...args} message={args.message} onClose={() => setVisible(false)} />
  );
};

export const Info: Story = {
  render: (args) => <ToastWrapper {...args} />,
  args: {
    message: 'This is an info toast',
    type: 'info',
    duration: 3000,
  },
};

export const Success: Story = {
  render: (args) => <ToastWrapper {...args} />,
  args: {
    message: 'Action completed successfully!',
    type: 'success',
    duration: 3000,
  },
};

export const Error: Story = {
  render: (args) => <ToastWrapper {...args} />,
  args: {
    message: 'Something went wrong!',
    type: 'error',
    duration: 3000,
  },
};
