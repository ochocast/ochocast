import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import '../../../../index.css';
import Commentary from './Thumbnail';
import { MemoryRouter } from 'react-router-dom';

const meta = {
  title: 'Video/Thumbnail',
  component: Commentary,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'centered',
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
  // More on argTypes: https://storybook.js.org/docs/api/argtypes
  argTypes: {},
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#action-args
  args: {
    Id: 'id',
    title: 'A title of video',
    imageSrc: '/example',
    createBy: 'John Doe',
    createdAt: '2021-09-01',
    tags: ['tag1', 'tag2', 'tag3'],
  },
} satisfies Meta<typeof Commentary>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};
