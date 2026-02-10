import type { Meta, StoryObj } from '@storybook/react';
import BrandingImage from './BrandingImage';
import '../../../index.css';

const meta = {
  title: 'generic/BrandingImage',
  component: BrandingImage,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof BrandingImage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Logo: Story = {
  args: {
    imageKey: 'logo',
    alt: 'Logo',
  },
};

export const Search: Story = {
  args: {
    imageKey: 'search',
    alt: 'Search',
  },
};

export const Fallback: Story = {
  args: {
    imageKey: 'non-existent',
    fallbackSrc: 'ochoIconFull.svg',
    alt: 'Fallback',
  },
};
