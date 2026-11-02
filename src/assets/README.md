# Assets Directory

This directory contains app icons and other assets for Spoken.

## Required Icons

For proper app packaging, you'll need the following icon files:

- `icon.icns` - macOS icon (1024x1024 recommended)
- `icon.ico` - Windows icon (256x256 recommended)
- `icon.png` - Linux icon (512x512 recommended)

## Icon Specifications

- **macOS (.icns)**: 1024x1024 pixels, PNG format converted to ICNS
- **Windows (.ico)**: 256x256 pixels, PNG format converted to ICO
- **Linux (.png)**: 512x512 pixels, PNG format

## Creating Icons

You can create these icons using:

- Online converters like https://convertio.co/
- Design tools like Figma, Sketch, or Photoshop
- Command line tools like ImageMagick

`SpokenV2.png` is the source artwork for these icons. The macOS icon includes
transparent padding to fit alongside other macOS app icons. The legacy
`openwhispr.icon` catalog is not used for packaging.
