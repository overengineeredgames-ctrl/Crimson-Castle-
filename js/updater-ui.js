"use strict";

window.CCUpdater = (() => {
    let checkPromise = null;
    let popup = null;
    let updateInfo = null;
    let downloaded = false;
    let statusText = null;
    let updateButton = null;
    let cancelButton = null;

    function addStyles() {
        if (document.getElementById("cc-updater-styles")) return;
        const style = document.createElement("style");
        style.id = "cc-updater-styles";
        style.textContent = [
            ".cc-update-overlay{position:fixed;inset:0;z-index:40000;display:none;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;background:rgba(0,0,0,.78);color:#f3f7fb;font-family:Arial,sans-serif}",
            ".cc-update-card{width:min(500px,100%);padding:30px;border:1px solid #687b8d;border-radius:14px;background:linear-gradient(145deg,#26394b,#121e29);box-shadow:0 22px 70px rgba(0,0,0,.65);text-align:left}",
            ".cc-update-kicker{color:#e7b94e;font-size:11px;font-weight:bold;letter-spacing:3px}",
            ".cc-update-title{margin:10px 0;color:#f1c45c;font-size:clamp(25px,5vw,34px)}",
            ".cc-update-copy{color:#d2dce5;line-height:1.55}",
            ".cc-update-list{max-height:180px;overflow:auto;margin:16px 0;padding-left:22px;color:#c5d3df;line-height:1.6}",
            ".cc-update-version{color:#94a8b9;font-size:12px}",
            ".cc-update-status{min-height:20px;margin:12px 0;color:#e7c56f;font-size:13px}",
            ".cc-update-actions{display:flex;gap:10px;margin-top:20px}",
            ".cc-update-actions button{flex:1;padding:13px 10px;border:1px solid #71869a;border-radius:7px;background:#344d63;color:white;font-weight:bold;cursor:pointer}",
            ".cc-update-actions button:disabled{opacity:.55;cursor:default}",
            ".cc-update-actions .cc-update-primary{border-color:#f0ca70;background:#d9a83e;color:#18232d}"
        ].join("");
        document.head.appendChild(style);
    }

    function createPopup() {
        addStyles();
        popup = document.createElement("div");
        popup.className = "cc-update-overlay";

        const card = document.createElement("div");
        card.className = "cc-update-card";

        const kicker = document.createElement("div");
        kicker.className = "cc-update-kicker";
        kicker.textContent = "OVER ENGINEERED GAMES";

        const title = document.createElement("h2");
        title.className = "cc-update-title";
        title.textContent = "New update for CC is available!";

        const description = document.createElement("p");
        description.className = "cc-update-copy";
        description.id = "cc-update-description";

        const list = document.createElement("ul");
        list.className = "cc-update-list";
        list.id = "cc-update-changes";

        const version = document.createElement("div");
        version.className = "cc-update-version";
        version.id = "cc-update-version";

        statusText = document.createElement("div");
        statusText.className = "cc-update-status";

        const actions = document.createElement("div");
        actions.className = "cc-update-actions";

        updateButton = document.createElement("button");
        updateButton.className = "cc-update-primary";
        updateButton.textContent = "UPDATE NOW";
        updateButton.addEventListener("click", handleUpdateClick);

        cancelButton = document.createElement("button");
        cancelButton.textContent = "NOT NOW";
        cancelButton.addEventListener("click", () => {
            if (updateInfo && updateInfo.required) return;
            popup.style.display = "none";
            showMainMenu();
        });

        actions.append(updateButton, cancelButton);
        card.append(kicker, title, description, list, version, statusText, actions);
        popup.appendChild(card);
        document.body.appendChild(popup);

        window.ccUpdater.onProgress(progress => {
            statusText.textContent = "Downloading update... " + progress.percent + "%";
        });

        window.ccUpdater.onDownloaded(info => {
            downloaded = true;
            updateButton.disabled = false;
            updateButton.textContent = "RESTART TO UPDATE";
            statusText.textContent = "Version " + info.version + " is ready to install.";
        });

        window.ccUpdater.onError(error => {
            updateButton.disabled = false;
            updateButton.textContent = downloaded ? "RESTART TO UPDATE" : "TRY AGAIN";
            statusText.textContent = error.message || "The update could not be downloaded.";
        });
    }

    function showPopup(info) {
        if (!popup) createPopup();
        updateInfo = info;

        popup.querySelector("#cc-update-description").textContent =
            info.description || "It adds:";
        const list = popup.querySelector("#cc-update-changes");
        list.replaceChildren();

        (info.changes || []).forEach(change => {
            const item = document.createElement("li");
            item.textContent = change;
            list.appendChild(item);
        });

        popup.querySelector("#cc-update-version").textContent =
            "Version " + info.currentVersion + "  →  " + info.latestVersion;
        cancelButton.style.display = info.required ? "none" : "block";
        popup.style.display = "flex";
    }

    async function handleUpdateClick() {
        if (downloaded) {
            updateButton.disabled = true;
            statusText.textContent = "Restarting to install the update...";
            try {
                await window.ccUpdater.installUpdate();
            } catch (error) {
                updateButton.disabled = false;
                statusText.textContent = error.message;
            }
            return;
        }

        updateButton.disabled = true;
        updateButton.textContent = "DOWNLOADING...";
        statusText.textContent = "Connecting to the update server...";
        try {
            await window.ccUpdater.downloadUpdate();
            statusText.textContent = "Download started...";
        } catch (error) {
            updateButton.disabled = false;
            updateButton.textContent = "TRY AGAIN";
            statusText.textContent = error.message || "Could not start the update.";
        }
    }

    function beginCheck() {
        if (!window.ccUpdater) return Promise.resolve(null);
        if (!checkPromise) {
            checkPromise = window.ccUpdater.checkForUpdates()
                .catch(error => {
                    console.warn("CC update check failed:", error.message);
                    return null;
                });
        }
        return checkPromise;
    }

    function showMainMenu() {
        if (typeof Game === "undefined") return;
        Game.showOnly(Game.startScreen);
        Game.startScreen.classList.remove("cc-menu-enter");
        void Game.startScreen.offsetWidth;
        Game.startScreen.classList.add("cc-menu-enter");
    }

    async function finishBoot() {
        const info = await beginCheck();
        if (info && info.updateAvailable) {
            showPopup(info);
        } else {
            showMainMenu();
        }
    }

    if (window.ccUpdater) {
        window.addEventListener("load", beginCheck, { once: true });
    }

    return { beginCheck, finishBoot };
})();
