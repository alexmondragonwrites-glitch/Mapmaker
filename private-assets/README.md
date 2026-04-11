# Private Assets Folder

**This folder is intentionally ignored by Git** (see `.gitignore` in the
project root). Third-party licensed assets such as Wonderdraft asset
packs live here, never in the public repository.

## Why?

Commercial asset packs (Wonderdraft, Inkarnate, Unsplash Plus, etc.)
almost always prohibit redistribution of the raw files. Committing them
to a public GitHub repo would violate those licenses. To stay safe:

- Assets stored here are **only on your local machine**
- Git will not track them even if you run `git add -A`
- The live GitHub Pages site does not contain them -- users import
  their own assets into the browser (IndexedDB) via the Asset Panel

## Folder layout

```
private-assets/
├── mountains/       mountain_*.png, peak_*.png, range_*.png
├── hills/           hill_*.png
├── trees/           tree_*.png, pine_*.png, oak_*.png
├── forests/         forest_*.png (large groves / woodland tiles)
├── houses/          house_human_*.png, house_elven_*.png, etc.
├── castles/         castle_*.png, keep_*.png, fort_*.png
├── towers/          tower_*.png
├── rivers/          river_*.png (optional, procedural works well)
└── decorations/     compass_*.png, border_*.png, cartouche_*.png
```

Asset files use a `<category>_<name>.png` naming convention so the
importer can automatically classify them.

## How the app uses these

1. **In dev mode** (`npm run dev`): if a file `private-assets/manifest.json`
   exists, the app auto-loads the PNGs from here on startup.
2. **In production** (GitHub Pages): users drag a ZIP file or folder of
   PNGs into the Asset Panel. The loader parses filenames, stores the
   images in IndexedDB, and the generators use them on the next render.

See `src/engine/assets-runtime/` (coming with Package 2) for the
loader implementation.

## Licensed asset packs I use

Keep a personal note here of which packs are installed, so you know what
licenses apply to maps you export:

- [ ] _example: Wonderdraft - Detailed Mountains and Hills MEGAPACK_
  - Source: <https://...>
  - License: Personal + Commercial use allowed, no redistribution
  - Installed: YYYY-MM-DD

## Sanity check

Before you commit, make sure:

```bash
git status
```

does **not** list any files inside `private-assets/` other than README
files. If it does, your `.gitignore` is not working -- stop, fix it,
and only then commit.
