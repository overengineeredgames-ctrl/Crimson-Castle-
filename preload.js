"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ccUpdater", {
    getVersion: () => ipcRenderer.invoke("cc:get-version"),
    checkForUpdates: () => ipcRenderer.invoke("cc:check-updates"),
    downloadUpdate: () => ipcRenderer.invoke("cc:download-update"),
    installUpdate: () => ipcRenderer.invoke("cc:install-update"),
    onProgress: callback => {
        const listener = (_event, data) => callback(data);
        ipcRenderer.on("cc:update-progress", listener);
        return () => ipcRenderer.removeListener("cc:update-progress", listener);
    },
    onDownloaded: callback => {
        const listener = (_event, data) => callback(data);
        ipcRenderer.on("cc:update-downloaded", listener);
        return () => ipcRenderer.removeListener("cc:update-downloaded", listener);
    },
    onError: callback => {
        const listener = (_event, data) => callback(data);
        ipcRenderer.on("cc:update-error", listener);
        return () => ipcRenderer.removeListener("cc:update-error", listener);
    }
});
