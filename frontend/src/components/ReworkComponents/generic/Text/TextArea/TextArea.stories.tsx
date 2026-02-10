import type { Meta, StoryObj } from '@storybook/react';
import TextArea from './TextArea';
import '../../../../../index.css';

const meta = {
  title: 'generic/Text/TextArea',
  component: TextArea,
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
} satisfies Meta<typeof TextArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: 'Description',
    value: '',
    name: 'description',
    placeholder: 'Enter a description',
    error: false,
  },
};

export const WithValue: Story = {
  args: {
    label: 'Bio',
    value: 'This is my bio.',
    name: 'bio',
    placeholder: 'Enter your bio',
    error: false,
    cols: 50,
  },
};

export const Error: Story = {
  args: {
    label: 'Comment',
    value: '',
    name: 'comment',
    placeholder: 'Write a comment...',
    error: true,
  },
};

export const Disabled: Story = {
  args: {
    label: 'Locked',
    value: 'This content cannot be changed.',
    name: 'locked',
    placeholder: '',
    error: false,
    disabled: true,
  },
};
