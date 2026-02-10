import type { Meta, StoryObj } from '@storybook/react';
import '../../../../../index.css';
import Commentary, { CommentaryDescriptionState } from './Commentary';

const meta = {
  title: 'Video/Commentary',
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
    id: 'story-comment-1',
    firstname: 'Jhon',
    lastname: 'Doe',
    username: 'JDoe',
    email: 'Jhon.Doe@email.com',
    created_at: new Date(),
    content:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc scelerisque nisi convallis nisl iaculis vehicula. Vivamus non vestibulum dui, sed eleifend augue. Fusce imperdiet dolor eu rhoncus interdum.',
    state: CommentaryDescriptionState.reply,
    likes: 5,
    isLiked: false,
  },
} satisfies Meta<typeof Commentary>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};
