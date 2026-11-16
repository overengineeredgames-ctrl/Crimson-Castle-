# Crimson Castle

An in-development fortress warfare game made for enjoyment. This project is not an attempt to pirate or replace the original *Forts*.

## Run from source (development)

1. Install Node.js (LTS).
2. Download and extract the repository.
3. Open PowerShell in the extracted folder.
4. Run:

```powershell
npm.cmd install
npm.cmd start
```

## Build the Windows versions

Run this from PowerShell after installing the dependencies:

```powershell
npm.cmd run dist:win
```

This creates:
- A Windows setup installer in `dist`. The installer creates Start Menu and desktop shortcuts. This is the recommended version because it supports in-app updates.
- A portable ZIP in `dist`. Extract it anywhere, then double-click **Create Desktop Shortcut.bat**. It places a Crimson Castle shortcut on your Windows desktop. You can then launch the game from that shortcut.

## Updates

The installed version checks the Crimson Castle update manifest when it starts. When a newer release is published, the game offers the update and can download/install it. To publish a new Windows update, create a GitHub release using the NSIS build:

```powershell
$env:GH_TOKEN = "YOUR_GITHUB_TOKEN"
npm.cmd run release:win
```

Publish releases with a new version in `package.json` and update `updater.json` to the same version. Do not publish the portable executable as the auto-update package; in-app updates are supported by the installed NSIS version.

