import Button, { ButtonType } from './Button';
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import '../../../../index.css';

const meta = {
  title: 'generic/Button',
  component: Button,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'centered',
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
  // More on argTypes: https://storybook.js.org/docs/api/argtypes
  argTypes: {
    type: {
      options: [ButtonType.primary, ButtonType.disabled, ButtonType.secondary],
      control: { type: 'radio' },
    },
  },
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#action-args
  args: {
    onClick: fn(() => {
      alert('Click !');
    }),
    label: 'My button',
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const Primary: Story = {
  args: {
    type: ButtonType.primary,
  },
};

export const Secondary: Story = {
  args: {
    type: ButtonType.secondary,
  },
};

export const Disabled: Story = {
  args: {
    type: ButtonType.disabled,
  },
};
