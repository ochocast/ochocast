# OchoCast Documentation Website

This website is built using [Docusaurus](https://docusaurus.io/), a modern static website generator.

## Multilingual Support

The site is fully available in **French** (default) and **English** with native Docusaurus i18n support.

- **French**: `http://localhost:3000/` (default locale)
- **English**: `http://localhost:3000/en/`

### Translation Status: 100% Complete

All pages, documentation, and UI elements are fully translated:
- 6 React pages (homepage, teams, code of conduct, etc.)
- Complete documentation (23 files)
- All tools and extras documentation
- Contribution guides
- UI labels and navigation

---

## Quick Start

### Installation

```bash
npm install
```

### Local Development

#### French (default)
```bash
npm start
```

#### English
```bash
npm start -- --locale en
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

---

## Build & Deployment

### Build

```bash
npm run build
```

This command generates static content for **all languages** into the `build` directory:
- `build/` - French version
- `build/en/` - English version

### Serve Built Site

```bash
npm run serve
```

Test the production build locally before deployment.

### Deployment

Using SSH:

```bash
USE_SSH=true npm run deploy
```

Not using SSH:

```bash
GIT_USER=<Your GitHub username> npm run deploy
```

If you are using GitHub pages for hosting, this command is a convenient way to build the website and push to the `gh-pages` branch.

---

## i18n Management

### Generate Translation Files

To generate translation files for a new locale:

```bash
npm run write-translations -- --locale en
```

This creates JSON files for UI translations in `i18n/en/`.

### Translation Structure

```
i18n/
└── en/                                    # English locale
    ├── code.json                          # Docusaurus UI translations
    ├── docusaurus-plugin-content-docs/    # Documentation translations
    │   ├── current.json                   # Sidebar labels
    │   └── current/                       # Translated markdown files
    ├── docusaurus-plugin-content-pages/   # React pages translations
    └── docusaurus-theme-classic/          # Theme translations
        └── navbar.json                    # Navigation labels
```

### Adding a New Language

1. Update `docusaurus.config.ts`:
```typescript
i18n: {
  defaultLocale: 'fr',
  locales: ['fr', 'en', 'es'], // Add new locale
}
```

2. Generate translation files:
```bash
npm run write-translations -- --locale es
```

3. Translate content in `i18n/es/`

---

## Project Structure

```
docs/
├── docs/                      # French documentation (source)
│   ├── documentation/         # Technical docs
│   └── contribution/          # Contribution guides
├── src/
│   ├── pages/                 # French React pages (source)
│   └── components/            # Shared components
├── i18n/
│   └── en/                    # English translations
├── static/                    # Static assets
└── docusaurus.config.ts       # Docusaurus configuration
```

---

## Documentation

The documentation is organized into:

- **Get Started**: Installation, pre-commit hooks
- **Tools**: Frontend, Backend, S3, Database, Auth, CI/CD
- **Extras**: Customization, RTMP server, Ubicast migration, WebSocket
- **Contribution**: Code of conduct, team information

---

## Tech Stack

- **Framework**: Docusaurus 3.x
- **Language**: TypeScript + React
- **Styling**: CSS Modules
- **i18n**: Native Docusaurus i18n
- **Deployment**: Static site hosting (GitHub Pages, Netlify, etc.)

---

## Useful Links

- [Docusaurus Documentation](https://docusaurus.io/)
- [Docusaurus i18n Guide](https://docusaurus.io/docs/i18n/introduction)
- [OchoCast GitHub](https://github.com/ochocast/ochocast-webapp)

---

## Contributing

See the [Contribution Guide](./docs/contribution/) for information on how to contribute to the documentation.

---

**Made by the OchoCast teams (2023-2026)**
