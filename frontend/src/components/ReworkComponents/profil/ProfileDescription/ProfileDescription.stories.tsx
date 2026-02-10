import type { Meta, StoryObj } from '@storybook/react';
import '../../../../index.css';
import ProfileDescription, {
  ProfileDescriptionState,
} from './ProfileDescription';

const meta = {
  title: 'Profil/Description',
  component: ProfileDescription,
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
    firstname: 'John Doe',
    lastname: '',
    username: 'JDoe',
    email: 'john.doe@email.com',
    description:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc scelerisque nisi convallis nisl iaculis vehicula. Vivamus non vestibulum dui, sed eleifend augue. Fusce imperdiet dolor eu rhoncus interdum',
    state: ProfileDescriptionState.large,
  },
} satisfies Meta<typeof ProfileDescription>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Large: Story = {
  args: {},
};

export const Tiny: Story = {
  args: {
    state: ProfileDescriptionState.tiny,
  },
};

export const Minimal: Story = {
  args: {
    state: ProfileDescriptionState.minimal,
  },
};

export const Standard: Story = {
  args: {
    state: ProfileDescriptionState.standard,
  },
};
