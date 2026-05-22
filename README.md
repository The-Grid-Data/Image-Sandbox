# Image Sandbox

A simple browser tool for cleaning up and adapting logos and images. Drop in a file, make your changes, download the result. Nothing to install, nothing uploaded anywhere.

---

## Why this exists

When you're working with brand assets, you often need the same logo in several variations — white version for dark backgrounds, transparent background for overlays, higher resolution for print. Doing this properly usually means opening Figma or Photoshop, which is overkill for a quick export.

Image Sandbox does the common stuff in one place, in the browser, in under a minute.

---

## What you can do with it

**Change colors** — Switch a logo to white, black, or any custom color. Works on both SVG logos and regular image files. For SVGs it edits the underlying code; for PNGs and other image formats it works pixel by pixel.

**Remove the background** — Strip out a white, black, or any solid-color background. A brush tool lets you touch up any areas that weren't quite right.

**Upscale** — Double or quadruple the resolution when you need a larger version and only have a small file.

**Compare** — A slider lets you drag between the original and your edited version to check the result before downloading.

---

## How to use it

Open `index.html` in a browser. Drag your image onto the page. Make your edits. Click Download.

Your files stay on your machine the whole time.

---

## Supported file types

SVG, PNG, JPG, WebP, AVIF, GIF, BMP, TIFF, ICO. All image formats download as PNG; SVGs download as SVG.
