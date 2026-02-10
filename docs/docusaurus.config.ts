import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'OchoCast',
  tagline: 'Une application libre pour la diffusion et le partage de vidéo.',
  favicon: 'img/logo_OCHOCAST.png',
  url: 'https://ochocast.fr',
  baseUrl: '/',
  organizationName: 'ochocast',
  projectName: 'ochocast.github.io',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'fr',
    locales: ['fr', 'en'],
    localeConfigs: {
      fr: {
        label: 'Français',
        direction: 'ltr',
        htmlLang: 'fr-FR',
      },
      en: {
        label: 'English',
        direction: 'ltr',
        htmlLang: 'en-US',
      },
    },
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts'
        },
        blog: {
          showReadingTime: true,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
    navbar: {
      title: 'OchoCast',
      logo: {
        alt: 'OchoCast Logo',
        src: 'img/logo_OCHOCAST.png',
      },
      items: [
        {
          href: 'https://demo.ochocast.fr',
          label: 'Accéder au produit',
          position: 'right',
        },
        {
          type: 'docSidebar',
          sidebarId: 'documentationSidebar',
          position: 'right',
          label: 'Documentation',
        },
        {
          type: 'localeDropdown',
          position: 'right',
        },
      ],
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
  
  deploymentBranch: 'main',
};

export default config;
