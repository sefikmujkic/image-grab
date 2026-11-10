# Image Grab

A Firefox extension that downloads the full-size original of any image or video, not the thumbnail.

## What it does

- Hover an image or video and a button appears on its bottom-left corner. One click saves the original.
- Right-click a picture and choose "Download original", even when a site covers it with a link.
- Hold Z over an image to preview the full-size version.
- Alt+Shift+D downloads whatever is under the pointer.
- The toolbar button lists every image on the page so you can save several at once.
- Works inside full-screen galleries and lightboxes.
- A gear in the toolbar popup opens the settings, which turn each of these on or off and changes the shortcut, preview key, button corner, save folder and blocked sites.

## How it finds the original

For the picture you point at, it collects every candidate address: the link around the image, the
largest `srcset` or `<picture>` entry, lazy-load attributes such as `data-src`, and guesses for common
thumbnail patterns (see `rules.js`). It loads each one and keeps the one with the most pixels.
Videos are saved only when they are a plain file; streams (blob, HLS, DASH) cannot be saved.

## Privacy

No data is collected. There are no accounts, no settings and no network requests other than loading
the image addresses the page already references.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension manifest (Manifest V3, Firefox 140+) |
| `background.js` | Right-click menu, shortcut, and downloads |
| `content.js` | Hover button, preview, and picking the best version |
| `rules.js` | Thumbnail-to-original guesses for common sites |
| `popup.html`, `popup.js` | Toolbar list of every image on the page |
| `settings.js`, `options.html`, `options.css`, `options.js` | Defaults and the settings page |
| `icon.svg` | Icon |

There is no build step. The files in this repository are the files in the extension.

## Try it

1. Open `about:debugging#/runtime/this-firefox`.
2. Click Load Temporary Add-on and pick `manifest.json`.

## License

MIT. See [LICENSE](LICENSE).
