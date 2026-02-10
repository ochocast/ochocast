import type { Meta, StoryObj } from '@storybook/react';
import InputFile from './InputFile';
import '../../../index.css';

const meta = {
  title: 'generic/InputFile',
  component: InputFile,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    onChange: { action: 'changed' },
  },
} satisfies Meta<typeof InputFile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: 'Select a file to upload',
    disable: false,
    required: true,
    onChange: () => {},
  },
};

export const Disabled: Story = {
  args: {
    placeholder: 'Upload is disabled',
    disable: true,
    required: false,
    onChange: () => {},
  },
};
