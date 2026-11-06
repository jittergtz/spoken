# Assets Directory

This directory contains app icons and other assets for Ducky.

## Required Icons

For proper app packaging, you'll need the following icon files:

- `icon.icns` - macOS icon (1024x1024 recommended)
- `icon.ico` - Windows icon (256x256 recommended)
- `icon.png` - shared UI, Dock, favicon, Windows/Linux tray, and Linux icon (1024x1024)
- `iconTemplate.png`, `iconTemplate@2x.png`, `iconTemplate@3x.png` - macOS menu bar
  template images at 18, 36, and 54 pixels

## Icon Specifications

- **macOS (.icns)**: 1024x1024 pixels, PNG format converted to ICNS
- **Windows (.ico)**: 256x256 pixels, PNG format converted to ICO
- **Linux (.png)**: 1024x1024 pixels, PNG format

## Creating Icons

`Ducky.png` is the original supplied purple duck artwork, preserved unchanged.
Run `npm run build:icons` on macOS to regenerate all icon sizes and formats.
The source artwork's background and padding are preserved in every format.

The macOS menu bar uses a separate monochrome duck, traced from the supplied
white duck silhouette in `ducky-tray.svg`. Its background and eye are transparent;
macOS tints the image for light/dark menus and selection. The SVG is the editable
master; Electron loads the generated PNGs and their Retina representations.
Run `npm run build:tray-icon` to regenerate only these menu bar images on any
platform, or `npm run build:icons` to regenerate all icons on macOS.

`ducky.icon` contains the same artwork for the optional Apple Icon Composer
workflow. Packaging currently uses `icon.icns`.
