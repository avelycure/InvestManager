# Invest Manager for Obsidian

An Obsidian plugin for managing investments. This repository contains the initial plugin structure; investment features have not been implemented yet.

## Development

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
```

To try the plugin, copy or symlink this repository into `<vault>/.obsidian/plugins/invest-manager/`, then enable **Invest Manager** under **Settings → Community plugins**. The development command rebuilds `main.js` when source files change. Reload Obsidian after a rebuild.

Before committing changes, run:

```sh
npm run lint
npm run build
```

The production build creates `main.js` alongside `manifest.json`. Both files are needed to install the plugin manually.

## Status

This is a development scaffold, not a published Obsidian community plugin. No release has been created yet.

## License

MIT. See [LICENSE](LICENSE).
