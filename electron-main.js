"use strict";

const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");

const MANIFEST_URL = "https://raw.githubusercontent.com/overengineeredgames-ctrl/Forts/main/updater.json";
let mainWindow = null;
let updateDownloadStarted = false;

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.allowDowngrade = false;
autoUpdater.allowPrerelease = false;

function compareVersions(a, b) {
    const parse = value => String(value || "0").replace(/^v/i, "").split(/[.+-]/)[0]
        .split(".").map(part => Number.parseInt(part, 10) || 0);
    const left = parse(a);
    const right = parse(b);
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
        const difference = (left[i] || 0) - (right[i] || 0);
        if (difference !== 0) return difference > 0 ? 1 : -1;
    }
    return 0;
}

function sendToGame(channel, data) {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, data);
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: "#050505",
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    mainWindow.loadFile(path.join(__dirname, "index.html"));
    mainWindow.once("ready-to-show", () => mainWindow.show());
    mainWindow.on("closed", () => { mainWindow = null; });
}

ipcMain.handle("cc:check-updates", async () => {
    const response = await fetch(MANIFEST_URL, {
        cache: "no-store",
        signal: AbortSignal.timeout(7000)
    });
    if (!response.ok) throw new Error("Could not reach the Crimson Castle update server.");

    const manifest = await response.json();
    if (!manifest.version || !Array.isArray(manifest.changes)) {
        throw new Error("The update information file is invalid.");
    }

    const currentVersion = app.getVersion();
    return {
        currentVersion,
        latestVersion: manifest.version,
        updateAvailable: compareVersions(manifest.version, currentVersion) > 0,
        required: Boolean(manifest.required),
        title: manifest.title || "Crimson Castle update",
        description: manifest.description || "",
        changes: manifest.changes,
        releaseDate: manifest.releaseDate || ""
    };
});

ipcMain.handle("cc:download-update", async () => {
    if (!app.isPackaged) throw new Error("Updates can only be installed from the packaged game.");
    if (updateDownloadStarted) return { started: true };

    updateDownloadStarted = true;
    try {
        const result = await autoUpdater.checkForUpdates();
        if (!result || compareVersions(result.updateInfo.version, app.getVersion()) <= 0) {
            updateDownloadStarted = false;
            throw new Error("The installer for this update has not been published yet.");
        }
        await autoUpdater.downloadUpdate();
        return { started: true };
    } catch (error) {
        updateDownloadStarted = false;
        throw error;
    }
});

ipcMain.handle("cc:install-update", () => {
    if (!app.isPackaged) throw new Error("The game must be installed before it can update itself.");
    autoUpdater.quitAndInstall(false, true);
    return true;
});

autoUpdater.on("download-progress", progress => {
    sendToGame("cc:update-progress", { percent: Math.round(progress.percent || 0) });
});
autoUpdater.on("update-downloaded", info => {
    sendToGame("cc:update-downloaded", { version: info.version });
});
autoUpdater.on("error", error => {
    updateDownloadStarted = false;
    sendToGame("cc:update-error", {
        message: error && error.message ? error.message : "The update could not be downloaded."
    });
});

app.whenReady().then(() => {
    createWindow();
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});
app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
