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
- A portable desktop ZIP in `dist`. It contains the portable game EXE, `Create Desktop Shortcut.bat`, and `CrimsonCastle.ico`.

## Add the portable game to your desktop

1. Find `Crimson-Castle-Setup-1.0.0-Desktop.zip` in the `dist` folder. The version number in the filename may be different.
2. Right-click the ZIP and choose **Extract All...**.
3. Open the extracted folder. Keep the game EXE, `Create Desktop Shortcut.bat`, and `CrimsonCastle.ico` together in that folder.
4. Double-click **Create Desktop Shortcut.bat**.
5. If Windows asks for permission to run the script, approve it only if you trust the ZIP and its source.
6. A **Crimson Castle** shortcut should appear on your Windows desktop. Double-click it to play.

**Important:** Do not move or delete the extracted game EXE or `CrimsonCastle.ico` after creating the shortcut. The shortcut points to the EXE in that extracted folder and uses the ICO beside it. If you move the folder, run `Create Desktop Shortcut.bat` again from its new location.

### If the shortcut has the default icon

Make sure `CrimsonCastle.ico` is in the same extracted folder as the EXE and the BAT file, then run `Create Desktop Shortcut.bat` again. Windows may cache shortcut icons; if the old icon remains, delete the old desktop shortcut and run the BAT file again.

## Updates

The installed version checks the Crimson Castle update manifest when it starts. When a newer release is published, the game offers the update and can download/install it. To publish a new Windows update, create a GitHub release using the NSIS build:

```powershell
$env:GH_TOKEN = "YOUR_GITHUB_TOKEN"
npm.cmd run release:win
```

Publish releases with a new version in `package.json` and update `updater.json` to the same version. Do not publish the portable executable as the auto-update package; in-app updates are supported by the installed NSIS version.
