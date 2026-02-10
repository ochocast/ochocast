import type { Meta, StoryObj } from '@storybook/react';
import HomeCardButton, { ButtonState } from './HomeCardButton';
import '../../../../index.css';

const meta = {
  title: 'generic/Button/HomeCardButton',
  component: HomeCardButton,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    onClickFunction: { action: 'clicked' },
  },
} satisfies Meta<typeof HomeCardButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {
  args: {
    Title: 'Active Button',
    State: ButtonState.active,
  },
};

export const Colored: Story = {
  args: {
    Title: 'Colored Button',
    State: ButtonState.colored,
  },
};

export const Disabled: Story = {
  args: {
    Title: 'Disabled Button',
    State: ButtonState.disabled,
  },
};
