# Crimson Castle

Crimson Castle is an in-development fortress-building and artillery game.

## Download

Open the [GitHub Releases](https://github.com/overengineeredgames-ctrl/Crimson-Castle-/releases) page for available builds.

- **Windows:** Download the setup installer or portable ZIP when a release is published.
- **Mobile:** Touch-friendly controls are included in the game interface, but an installable Android APK is not available yet.

## Run from source

1. Install [Node.js](https://nodejs.org/) (LTS).
2. Download or clone this repository.
3. Open a terminal in the project folder.
4. Install dependencies and start the game:

```powershell
npm install
npm start
```

## Build for Windows

In PowerShell, run:

```powershell
npm run dist:win
```

Build files are created in the `dist` folder.

To publish a Windows release, update the version in `package.json` and `updater.json` so they match, then run the **Publish Windows Release** workflow from the GitHub Actions tab.

## Controls

- **Build:** Select a building material, then drag from one joint to another.
- **Weapons:** Select a weapon, click a cannon to select it, aim, then click to fire.
- **Camera:** Use the mouse wheel to zoom, Shift + wheel or the left/right arrow keys to scroll, and middle-mouse drag to pan.
- **Grid:** Press `G`.
- **Repair:** Press `R`.
- **Pause:** Press `Esc`.
- **Tool categories:** Press `Q` or `E` to switch tabs.

On touch devices, the interface also provides on-screen camera, zoom, fire, and pause buttons.
