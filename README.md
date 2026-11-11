# LinkedIn Games Solver

A browser extension for Chrome and Firefox that helps solve LinkedIn's daily puzzle games.

- [Install from source](#install-from-source)

## Supported games

- [Queens](https://www.linkedin.com/games/queens/)
- [Mini-Sudoku](https://www.linkedin.com/games/sudoku/)
- [Zip](https://www.linkedin.com/games/zip/)
- [Tango](https://www.linkedin.com/games/tango/)
- [Patches](https://www.linkedin.com/games/patches/)
- [Wend](https://www.linkedin.com/games/wend/) using a locally bundled word list
- [Crossclimb](https://www.linkedin.com/games/crossclimb/) using LinkedIn's Reveal assist to uncover words before arranging them into a one-letter ladder
- [Pinpoint](https://www.linkedin.com/games/pinpoint/) using readable clue text and limited local probes; image-only clues are not inferred

## Use the extension

1. Open a supported game on LinkedIn.
2. Select the extension from your browser toolbar.
3. Choose the game-specific solve button.

For Pinpoint, enter the readable clues currently visible in the game before choosing **Find Pinpoint category**. If the solver needs more information, reveal another clue and try again.

## Install from a GitHub release

Download the browser ZIP from the [latest GitHub release](https://github.com/AnandRajput-ASR/LinkedIn-Games-Solver/releases/latest) and extract it.

### Chrome

1. Open `chrome://extensions/` and enable **Developer mode**.
2. Choose **Load unpacked** and select the extracted folder containing `manifest.json`.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on** and select `manifest.json` from the extracted folder.

Firefox temporary add-ons are removed when Firefox closes. A permanent Firefox installation requires a signed add-on.

## Build and test

Requirements: Node.js and npm.

```sh
npm install
node build.js
npm test
```

The build creates unpacked browser extensions in `chrome-dist/` and `firefox-dist/`. Add `--watch` to rebuild automatically when source files change.

The standard test command skips the exhaustive Tango equivalence test. Run it separately when making significant changes to the Tango line solver:

```sh
npm run test:slow
```

## Install from source

Run `node build.js` first.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on** and select `firefox-dist/manifest.json`.
3. After rebuilding, reload the add-on from the debugging page.

### Chrome

1. Open `chrome://extensions/` and enable **Developer mode**.
2. Choose **Load unpacked** and select the `chrome-dist/` folder.
3. After rebuilding, refresh the extension from the extensions page.
