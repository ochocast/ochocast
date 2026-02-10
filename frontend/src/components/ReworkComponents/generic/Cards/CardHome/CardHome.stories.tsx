import type { Meta, StoryObj } from '@storybook/react';
import '../../../../../index.css';
import CardHome from './CardHome';
import { ButtonType } from '../../Button/Button';

const meta = {
  title: 'generic/CardHome',
  component: CardHome,
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
    title: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    description:
      'Nullam vel semper diam. Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Mauris pharetra imperdiet dui, id fringilla felis dignissim nec. Suspendisse pretium sollicitudin nisl non sollicitudin. Praesent vel dolor gravida, suscipit dolor eget, sodales nunc. Aliquam erat volutpat. Ut tincidunt auctor arcu, id interdum nulla placerat nec.',
    buttonState: ButtonType.primary,
    buttonList: [
      {
        title: 'CallToAction 1',
        onClickFunction: () => {
          alert('Click !');
        },
      },
    ],
  },
} satisfies Meta<typeof CardHome>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const NoAction: Story = {
  args: {
    buttonList: [],
  },
};

export const DisableAction: Story = {
  args: {
    buttonState: ButtonType.disabled,
  },
};
