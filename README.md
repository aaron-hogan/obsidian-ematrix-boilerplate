# Obsidian Plugin Boilerplate with Tag Processing

A boilerplate for creating Obsidian plugins, with pre-built tag-based content processing functionality.

## Features

- Complete Obsidian plugin structure
- Content processing based on hashtags
- Settings panel with configuration options
- Logging and debugging system
- Event handling for file open and modification
- Command palette integration

## Using This Boilerplate

1. Clone this repository
2. Update the `manifest.json` with your plugin's information
3. Run `npm install` to install dependencies
4. Customize the code in `main.ts` to fit your needs
5. Build with `npm run build`

## Default Functionality

This boilerplate comes with a working feature that:

1. Detects when a note contains the `#ematrix` tag
2. Replaces the content with configurable placeholder text
3. Logs detection and processing for confirmation

You can use this as a starting point to build more complex functionality.

## Installation for Testing

### Manual Installation

1. Build the plugin with `npm run build`
2. Copy the `main.js`, `manifest.json`, and `styles.css` files to your vault's plugins folder: `<vault>/.obsidian/plugins/obsidian-ematrix/`
3. Reload Obsidian
4. Enable the plugin in settings

## Development Workflow

1. Run `npm run dev` to start compilation in watch mode
2. Make changes to the TypeScript code
3. When satisfied with your changes, build with `npm run build`
4. Copy the build output to your test vault for testing

## License

MIT