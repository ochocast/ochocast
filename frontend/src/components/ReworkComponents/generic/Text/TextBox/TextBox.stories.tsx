import type { Meta, StoryObj } from '@storybook/react';
import TextBox from './TextBox';
import '../../../../../index.css';

const meta = {
  title: 'generic/Text/TextBox',
  component: TextBox,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    onChange: { action: 'changed' },
  },
  args: {
    onChange: () => {},
  },
} satisfies Meta<typeof TextBox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    type: 'text',
    label: 'Username',
    value: '',
    name: 'username',
    placeholder: 'Enter your username',
    error: false,
  },
};

export const WithValue: Story = {
  args: {
    type: 'text',
    label: 'Email',
    value: 'john@example.com',
    name: 'email',
    placeholder: 'Enter your email',
    error: false,
  },
};

export const Error: Story = {
  args: {
    type: 'text',
    label: 'Password',
    value: '',
    name: 'password',
    placeholder: 'Enter your password',
    error: true,
  },
};

export const Disabled: Story = {
  args: {
    type: 'text',
    label: 'Disabled Field',
    value: 'Read only value',
    name: 'disabled',
    placeholder: 'Cannot edit this',
    error: false,
    disabled: true,
  },
};
