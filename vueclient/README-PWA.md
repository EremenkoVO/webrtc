# PWA Setup

This application is configured as a Progressive Web App (PWA).

## Icons

The PWA requires PNG icons in the `public` folder:
- `pwa-192x192.png` - 192x192 pixels
- `pwa-512x512.png` - 512x512 pixels

### Generating Icons

Icons are automatically generated from the SVG template (`public/pwa-icon.svg`) using:

```bash
npm run generate-icons
```

This script uses `sharp` to convert the SVG to PNG icons at the required sizes.

Alternatively, you can generate icons manually:
1. **Online tool**: Use https://realfavicongenerator.net/ or https://www.pwabuilder.com/imageGenerator
2. **ImageMagick**: `convert public/pwa-icon.svg -resize 192x192 public/pwa-192x192.png`
3. **Inkscape**: `inkscape public/pwa-icon.svg -w 192 -h 192 -o public/pwa-192x192.png`

## Features

- **Offline support**: Service worker caches assets for offline use
- **Installable**: Users can install the app on their devices
- **App-like experience**: Standalone display mode
- **Auto-update**: Service worker automatically updates when new version is available

## Testing

1. Build the app: `npm run build`
2. Preview: `npm run preview`
3. Open DevTools > Application > Service Workers to test
4. Use "Add to Home Screen" in mobile browsers to test installation
