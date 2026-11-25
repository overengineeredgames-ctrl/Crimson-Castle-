# Crimson Castle

Crimson Castle is an in-development fortress-building and artillery game.

## Download

Open the [GitHub Releases](https://github.com/overengineeredgames-ctrl/Crimson-Castle-/releases) page for available builds.

- **WINDOWS:** Download the setup installer or portable ZIP.
- **MOBILE:** The Android APK is built by the **Build Android APK** workflow. Run it from the GitHub Actions tab; the workflow also attaches the APK to the matching GitHub release. The public website and APK omit the debug panel; the desktop/Electron build retains it.

## Run from source (Windows)

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

## Build for Android

Open **Actions → Build Android APK → Run workflow** on GitHub. When it finishes, the APK is available under the workflow's Artifacts and is also attached to the matching GitHub release.

The Android build bundles Matter.js locally so the game physics do not depend on a CDN connection. The Windows Electron build remains separate.

## Power and water production

- **Solar Panel:** A low-cost source of steady energy.
- **Water Driller:** Place on a ground joint; it uses energy to produce water.
- **Water Storage:** Adds 300 water capacity, like a Battery adds energy capacity.
- **Geothermal Generator:** Uses 6 water and 1.25 energy per second to generate 18 energy per second. Build solar panels or windmills first, then drill and store enough water to sustain geothermal power.

## Controls

- **Build:** Select a building material, then drag from one joint to another.
- **Weapons:** Select a weapon, click a cannon to select it, aim, then click to fire. The Sniper fires a fast, straight 95-damage shot with a 5.5-second reload (230 Metal / 115 Energy). On Android, hold **GROUP** while tapping additional guns to aim/control them together; release **GROUP** when finished. Tap **✕** to clear all selected guns.
- **Camera:** Use the mouse wheel to zoom, Shift + wheel or the left/right arrow keys to scroll, and middle-mouse drag to pan.
- **Grid:** Press `G`.
- **Repair:** Press `R`.
- **Pause:** Press `Esc`.
- **Tool categories:** Press `Q` or `E` to switch tabs.

On touch devices, the interface also provides on-screen camera, zoom, fire, and pause buttons.
