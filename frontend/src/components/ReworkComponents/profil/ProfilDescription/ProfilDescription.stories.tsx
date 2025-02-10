import type {Meta, StoryObj} from '@storybook/react';
import '../../../../index.css';
import ProfilDescription, {ProfilDescriptionState} from "./ProfilDescription";

const meta = {
    title: 'Profil/Description',
    component: ProfilDescription,
    parameters: {
        // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
        layout: 'centered',
    },
    // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
    tags: ['autodocs'],
    // More on argTypes: https://storybook.js.org/docs/api/argtypes
    argTypes: {
    },
    // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#action-args
    args: {
        name: 'John Doe',
        email: 'john.doe@email.com',
        description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc scelerisque nisi convallis nisl iaculis vehicula. Vivamus non vestibulum dui, sed eleifend augue. Fusce imperdiet dolor eu rhoncus interdum',
        state: ProfilDescriptionState.large
    },
} satisfies Meta<typeof ProfilDescription>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Large: Story = {
    args: {
    },
};

export const Tiny: Story = {
    args: {
        state: ProfilDescriptionState.tiny
    },
};

export const Minimal: Story = {
    args: {
        state: ProfilDescriptionState.minimal
    },
};

export const Standard: Story = {
    args: {
        state: ProfilDescriptionState.standard
    },
};
