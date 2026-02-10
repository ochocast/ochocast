import type { Preview } from '@storybook/react';
import { WithProviders } from '../src/StorybookDecorators';

const preview: Preview = {
  decorators: [WithProviders],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
