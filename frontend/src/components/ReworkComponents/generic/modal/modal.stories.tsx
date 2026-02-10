import type { Meta, StoryObj } from '@storybook/react';
import Modal from './modal';
import '../../../../index.css';

const meta = {
  title: 'generic/Modal',
  component: Modal,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    toggle: { action: 'toggled' },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    isOpen: true,
    children: (
      <div style={{ padding: '20px' }}>
        <h2>Modal Title</h2>
        <p>This is a modal content.</p>
        <button onClick={() => {}}>Close</button>
      </div>
    ),
    toggle: () => {},
  },
};

export const Closed: Story = {
  args: {
    isOpen: false,
    children: <div>Should not be visible</div>,
    toggle: () => {},
  },
};
