import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'OchoCast',
  tagline: 'Une application libre pour la diffusion et le partage de vidéo.',
  favicon: 'img/favicon.ico',
  url: 'https://ochocast.fr',
  baseUrl: '/',
  organizationName: 'ochocast',
  projectName: 'ochocast',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  scripts: [
    {
      src: 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit',
      async: true,
    },
    '/js/google-translate.js',
  ],

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
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          type: 'docSidebar',
          position: 'left',
          sidebarId: 'contribution',
          label: 'Contribution'
        },
        {
          href: 'https://github.com/ochocast/octocast-webapp',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
