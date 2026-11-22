
"use strict";

const Game = {
    canvas: null,
    ctx: null,

    running: false,
    state: "menu",

    lastFrame: 0,
    resourceTimer: 0,

    endScreen: null,
    startScreen: null,
    pauseScreen: null,

    difficulty: "normal",
    settingsScreen: null,
    settingsReturnScreen: null,
    preferences: { theme: "dark", fastBoot: false },
    cameraOffsetX: 0,
    cameraOffsetY: 0,
    cameraZoom: 1,
    isMobileViewport: false,
    panDrag: null,

    get cameraX() {
        const worldWidth = Physics.worldWidth || this.canvas.width;
        const visibleWidth = this.canvas.width / this.cameraZoom;
        return Math.max(0, Math.min(
            worldWidth - visibleWidth,
            this.cameraOffsetX
        ));
    },

    clampCamera() {
        const worldWidth = Physics.worldWidth || this.canvas.width;
        const visibleWidth = this.canvas.width / this.cameraZoom;
        const visibleHeight = this.canvas.height / this.cameraZoom;
        const worldBottom = (Physics.groundY || this.canvas.height * 0.82) + 260;
        this.cameraOffsetX = Math.max(0, Math.min(Math.max(0, worldWidth - visibleWidth), this.cameraOffsetX));
        const mobileVerticalRoom = this.isMobileViewport ? this.canvas.height * 0.75 : 0;
        this.cameraOffsetY = Math.max(-this.canvas.height * 0.75,
            Math.min(Math.max(-this.canvas.height * 0.75, worldBottom + mobileVerticalRoom - visibleHeight), this.cameraOffsetY));
    },

    setCameraZoomAt(clientX, nextZoom, clientY = null) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = clientX - rect.left;
        const screenY = (clientY == null ? rect.top + rect.height / 2 : clientY) - rect.top;
        const worldAnchorX = this.cameraX + screenX / this.cameraZoom;
        const worldAnchorY = this.cameraOffsetY + screenY / this.cameraZoom;
        this.cameraZoom = Math.max(0.25, Math.min(2.5, nextZoom));
        this.cameraOffsetX = worldAnchorX - screenX / this.cameraZoom;
        this.cameraOffsetY = worldAnchorY - screenY / this.cameraZoom;
        this.clampCamera();
    },

    init() {
        this.canvas = document.getElementById("gameCanvas");

        if (!this.canvas) {
            console.error("Missing #gameCanvas");
            return;
        }

        this.ctx = this.canvas.getContext("2d", { alpha: false });
        this.loadPreferences();
        this.applyTheme();
        this.resizeCanvas();

        Physics.init();

        // Phones have a much narrower landscape viewport than desktop.
        // Start mobile battles zoomed out so more of the battlefield is visible.
        this.isMobileViewport = window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
        this.cameraZoom = this.isMobileViewport ? 0.5 : 1;
        const visibleWorldWidth = this.canvas.width / this.cameraZoom;
        this.cameraOffsetX = Math.max(0, (Physics.worldWidth - visibleWorldWidth) / 2);
        // Raise the mobile battlefield slightly in the opening view.
        this.cameraOffsetY = this.isMobileViewport ? -this.canvas.height * 0.75 : 0;
        this.clampCamera();
        Building.init();
        Weapons.init();
        AI.init();

        this.createMenus();
        this.setupInput();
        this.setupMobileControls();
        this.setupToolbarTabs();

        this.state = "menu";

        // A battle restart skips the studio boot animation once.
        let skipBoot = false;
        try {
            skipBoot = sessionStorage.getItem("ccSkipBootOnce") === "1";
            if (skipBoot) sessionStorage.removeItem("ccSkipBootOnce");
        } catch (error) {
            skipBoot = false;
        }

        if (skipBoot) this.showOnly(this.startScreen);
        else this.playBootSequence();

        this.running = true;
        this.lastFrame = performance.now();

        requestAnimationFrame(t => this.loop(t));
    },

    setupToolbarTabs() {
        const tabs = Array.from(document.querySelectorAll("[data-tool-tab]"));
        const toolbar = document.querySelector(".toolbar");
        const scrollArea = document.querySelector(".toolbar-scroll");

        if (!tabs.length || !toolbar) return;

        this.activeToolTab = "build";

        this.selectToolTab = category => {
            if (!tabs.some(tab => tab.dataset.toolTab === category)) return;

            this.activeToolTab = category;
            tabs.forEach(tab => {
                const selected = tab.dataset.toolTab === category;
                tab.classList.toggle("active", selected);
                tab.setAttribute("aria-selected", String(selected));
            });

            toolbar.querySelectorAll(".tool").forEach(tool => {
                tool.hidden = tool.dataset.toolCategory !== category;
            });

            if (scrollArea) scrollArea.scrollLeft = 0;
        };

        this.cycleToolTab = direction => {
            const currentIndex = tabs.findIndex(tab =>
                tab.dataset.toolTab === this.activeToolTab
            );
            const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
            this.selectToolTab(tabs[nextIndex].dataset.toolTab);
        };

        this.selectToolbarItem = number => {
            const items = Array.from(toolbar.querySelectorAll(
                '.tool[data-tool-category="' + this.activeToolTab + '"]:not([hidden])'
            ));
            const item = items[number - 1];
            if (!item) return false;

            item.click();
            item.focus({ preventScroll: true });
            return true;
        };

        tabs.forEach(tab => {
            tab.addEventListener("click", () => this.selectToolTab(tab.dataset.toolTab));
            tab.title = tab.textContent.trim() + " (Q / E to switch tabs)";
        });

        this.selectToolTab("build");
    },

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    },

    mousePosition(event) {
        const rect = this.canvas.getBoundingClientRect();

        return {
            x: (event.clientX - rect.left) *
                (this.canvas.width / rect.width) / this.cameraZoom + this.cameraX,
            y: (event.clientY - rect.top) *
                (this.canvas.height / rect.height) / this.cameraZoom + this.cameraOffsetY
        };
    },

    createMenus() {
        const style = document.createElement("style");

        style.textContent = `
            .forts-overlay {
                position:fixed;
                inset:0;
                z-index:10000;
                display:none;
                align-items:center;
                justify-content:center;
                padding:20px;
                box-sizing:border-box;
                background:radial-gradient(circle at center,rgba(38,62,84,.88),rgba(5,12,22,.96));
                color:#f3f7fb;
                font-family:Arial,sans-serif;
                text-align:center;
            }

            .forts-menu-card {
                width:min(440px,100%);
                padding:34px 28px;
                border:1px solid #536b80;
                border-radius:15px;
                background:linear-gradient(145deg,#26394b,#172330);
                box-shadow:0 20px 65px rgba(0,0,0,.55);
            }

            .forts-menu-title {
                margin:0 0 8px;
                font-size:clamp(34px,7vw,54px);
                letter-spacing:5px;
                color:#f1c45c;
                text-shadow:0 3px 12px rgba(0,0,0,.5);
            }

            .forts-menu-subtitle {
                margin:0 0 26px;
                color:#c4d2df;
                line-height:1.5;
            }

            .forts-menu-button {
                display:block;
                width:100%;
                margin:10px 0;
                padding:14px 18px;
                border:1px solid #73899d;
                border-radius:8px;
                background:#344d63;
                color:white;
                font-size:16px;
                font-weight:bold;
                cursor:pointer;
                transition:background .15s,transform .15s;
            }

            .forts-menu-button:hover {
                background:#466781;
                transform:translateY(-1px);
            }

            .forts-menu-button.primary {
                background:#d9a83e;
                border-color:#f0ca70;
                color:#18232d;
            }

            .forts-menu-button.primary:hover {
                background:#f0c45b;
            }

            .forts-difficulty {
                display:flex;
                gap:8px;
                margin:12px 0 20px;
            }

            .forts-difficulty button {
                flex:1;
                padding:10px 5px;
                border:1px solid #62788c;
                border-radius:7px;
                background:#1c2b39;
                color:#dce7f0;
                cursor:pointer;
            }

            .forts-difficulty button.active {
                border-color:#f0c45b;
                background:#705a2c;
                color:white;
            }

            .forts-menu-help {
                margin-top:20px;
                color:#9fb1c1;
                font-size:12px;
                line-height:1.6;
            }

            .forts-settings-row {
                display:flex;
                align-items:center;
                justify-content:space-between;
                gap:16px;
                margin:18px 0;
                padding:14px;
                border:1px solid #536b80;
                border-radius:8px;
                background:rgba(0,0,0,.16);
                text-align:left;
            }

            .forts-settings-row strong { display:block; margin-bottom:5px; }
            .forts-settings-row small { color:#9fb1c1; line-height:1.4; }
            .forts-settings-row select { min-width:125px; padding:9px; border-radius:6px; }
            .forts-settings-row input { width:20px; height:20px; accent-color:#d9a83e; }
            .forts-settings-status { min-height:18px; color:#e7c56f; font-size:12px; }

            .cc-fast-boot .cc-boot-game { animation-duration:.7s; }
            .cc-fast-boot .cc-boot-studio { animation-duration:1.1s; animation-delay:.65s; }
            .cc-fast-boot .cc-gear-arrival { animation-duration:.65s; animation-delay:.7s; }
            .cc-fast-boot .cc-gear { animation-duration:1.5s; animation-delay:1.35s; }
            .cc-boot-screen { background:#050505 !important; color:#f3f3f3 !important; }

            .forts-pause-label {
                color:#f0c45b;
                font-size:12px;
                letter-spacing:3px;
                font-weight:bold;
            }

            .cc-boot-screen {
                position:fixed;
                inset:0;
                z-index:20000;
                display:flex;
                align-items:center;
                justify-content:center;
                overflow:hidden;
                background:#050505;
                color:#f3f3f3;
                font-family:Arial,sans-serif;
                text-align:center;
                opacity:1;
            }

            .cc-boot-scene {
                position:absolute;
                inset:0;
                display:flex;
                flex-direction:column;
                align-items:center;
                justify-content:center;
                opacity:0;
                pointer-events:none;
            }

            .cc-boot-game {
                animation:cc-title-sequence 2.3s ease-in-out both;
            }

            .cc-boot-studio {
                animation:cc-studio-sequence 3.8s ease-in-out 2.35s both;
            }

            .cc-boot-title {
                margin:0;
                color:#f1f1f1;
                font-size:clamp(42px,9vw,86px);
                font-weight:800;
                letter-spacing:clamp(5px,1.5vw,15px);
                text-transform:uppercase;
                text-shadow:0 0 28px rgba(190,25,35,.22);
            }

            .cc-boot-subtitle {
                margin-top:14px;
                color:#a7a7a7;
                font-size:12px;
                letter-spacing:5px;
                text-transform:uppercase;
            }

            .cc-version-label {
                margin-top:10px;
                color:#8fa2b4;
                font-size:11px;
                letter-spacing:2px;
                text-align:center;
            }

            .cc-gear-arrival {
                animation:cc-gear-roll-in 1.55s cubic-bezier(.18,.82,.25,1) 2.55s both;
                will-change:transform,opacity;
            }

            .cc-gear {
                width:clamp(76px,12vw,112px);
                height:clamp(76px,12vw,112px);
                margin-bottom:22px;
                filter:drop-shadow(0 0 18px rgba(255,255,255,.08));
                transform-origin:50% 46%;
                animation:cc-gear-spin 2.4s linear 4.1s infinite;
            }

            .cc-studio-name {
                margin:0;
                color:#d2d2d2;
                font-size:clamp(24px,5vw,42px);
                font-weight:700;
                letter-spacing:clamp(3px,.8vw,8px);
                text-transform:uppercase;
            }

            .cc-studio-caption {
                margin-top:12px;
                color:#777;
                font-size:11px;
                letter-spacing:4px;
                text-transform:uppercase;
            }

            .cc-menu-enter {
                animation:cc-menu-fade-in .9s ease both;
            }

            @keyframes cc-title-sequence {
                0% { opacity:0; transform:translateY(12px); }
                22% { opacity:1; transform:translateY(0); }
                72% { opacity:1; transform:translateY(0); }
                100% { opacity:0; transform:translateY(-8px); }
            }

            @keyframes cc-studio-sequence {
                0% { opacity:0; transform:scale(.97); }
                22% { opacity:1; transform:scale(1); }
                78% { opacity:1; transform:scale(1); }
                100% { opacity:0; transform:scale(1.02); }
            }

            @keyframes cc-gear-roll-in {
                0% { opacity:0; transform:translateX(-65vw) rotate(-540deg) scale(.72); }
                12% { opacity:1; }
                78% { transform:translateX(8px) rotate(330deg) scale(1.04); }
                100% { opacity:1; transform:translateX(0) rotate(360deg) scale(1); }
            }

            @keyframes cc-gear-spin {
                from { transform:rotate(0deg); }
                to { transform:rotate(360deg); }
            }

            @keyframes cc-menu-fade-in {
                from { opacity:0; }
                to { opacity:1; }
            }
        `;

        document.head.appendChild(style);

        this.startScreen = this.createOverlay("forts-start-screen", `
            <div class="forts-menu-card">
                <div class="forts-pause-label">REAL-TIME FORTRESS WARFARE</div>
                <h1 class="forts-menu-title">CRIMSON CASTLE</h1>
                <p class="forts-menu-subtitle">
                    Build your fortress. Protect your core. Destroy the enemy.
                </p>
                <div class="cc-version-label" id="cc-menu-version">Loading version...</div>

                <div style="text-align:left;font-size:13px;color:#c4d2df">
                    <strong>Difficulty</strong>
                </div>

                <div class="forts-difficulty">
                    <button data-difficulty="easy">Easy</button>
                    <button data-difficulty="normal" class="active">Normal</button>
                    <button data-difficulty="hard">Hard</button>
                    <button data-difficulty="mega">MEGA HARD</button>
                </div>

                <button class="forts-menu-button primary" id="forts-start-button">
                    START BATTLE
                </button>
                <button class="forts-menu-button" id="forts-open-settings">SETTINGS</button>

                <div class="forts-menu-help">
                    Drag between joints to build beams<br>
                    Select Mine, then drag onto a joint to place it<br>
                    Mines cost 50 metal and generate 2 energy per second<br>
                    Cannon: 100 metal / 50 energy<br>
                    Machine Gun: hold fire for rapid, light damage<br>
                    Mega Cannon: 220 damage with a 15-second reload<br>
                    Click a cannon to select; aim and click to fire<br>
                    Mouse wheel zooms the battlefield; arrow keys move the camera in every direction<br>
                    Middle mouse drag pans the map horizontally and vertically<br>
                    Press ESC to pause
                </div>
            </div>
        `);

        this.pauseScreen = this.createOverlay("forts-pause-screen", `
            <div class="forts-menu-card">
                <div class="forts-pause-label">BATTLE TEMPORARILY HALTED</div>
                <h1 class="forts-menu-title">PAUSED</h1>
                <p class="forts-menu-subtitle">
                    Your fortress is safe while the battle is paused.
                </p>

                <button class="forts-menu-button primary" id="forts-resume-button">
                    RESUME
                </button>

                <button class="forts-menu-button" id="forts-pause-restart">
                    RESTART BATTLE
                </button>

                <button class="forts-menu-button" id="forts-main-menu-button">
                    MAIN MENU
                </button>
                <button class="forts-menu-button" id="forts-pause-settings">SETTINGS</button>

                <div class="forts-menu-help">Press ESC to resume</div>
            </div>
        `);

        this.endScreen = this.createOverlay("forts-end-screen", `
            <div class="forts-menu-card">
                <h1 class="forts-menu-title" id="forts-end-title">VICTORY</h1>
                <p class="forts-menu-subtitle" id="forts-end-message">
                    The enemy core has been destroyed.
                </p>

                <button class="forts-menu-button primary" id="forts-end-restart">
                    PLAY AGAIN
                </button>

                <button class="forts-menu-button" id="forts-end-menu">
                    MAIN MENU
                </button>
            </div>
        `);

        this.settingsScreen = this.createOverlay("forts-settings-screen", `
            <div class="forts-menu-card">
                <div class="forts-pause-label">GAME PREFERENCES</div>
                <h1 class="forts-menu-title">SETTINGS</h1>
                <div class="forts-settings-row">
                    <div><strong>Appearance</strong><small>Choose the game's menu and interface theme.</small></div>
                    <select id="cc-theme-select" aria-label="Appearance">
                        <option value="dark">Dark mode</option>
                        <option value="light">Light mode</option>
                    </select>
                </div>
                <label class="forts-settings-row" for="cc-fast-boot">
                    <div><strong>Fast boot</strong><small>Shorten the opening studio animation when the game starts.</small></div>
                    <input id="cc-fast-boot" type="checkbox">
                </label>
                <div class="forts-settings-status" id="cc-settings-status"></div>
                <button class="forts-menu-button" id="cc-check-updates">CHECK FOR UPDATES</button>
                <button class="forts-menu-button primary" id="cc-settings-back">BACK</button>
            </div>
        `);

        this.settingsScreen.querySelector("#cc-theme-select").value = this.preferences.theme;
        this.settingsScreen.querySelector("#cc-fast-boot").checked = this.preferences.fastBoot;
        this.settingsScreen.querySelector("#cc-theme-select").addEventListener("change", event => {
            this.preferences.theme = event.target.value === "light" ? "light" : "dark";
            this.savePreferences();
            this.applyTheme();
        });
        this.settingsScreen.querySelector("#cc-fast-boot").addEventListener("change", event => {
            this.preferences.fastBoot = event.target.checked;
            this.savePreferences();
        });
        this.settingsScreen.querySelector("#cc-settings-back").addEventListener("click", () => {
            this.showOnly(this.settingsReturnScreen || this.startScreen);
        });
        this.settingsScreen.querySelector("#cc-check-updates").addEventListener("click", async () => {
            const status = this.settingsScreen.querySelector("#cc-settings-status");
            status.textContent = "Checking for updates...";
            if (!window.CCUpdater || typeof window.CCUpdater.checkNow !== "function") {
                status.textContent = "Update checking is only available in the installed game.";
                return;
            }
            const info = await window.CCUpdater.checkNow();
            status.textContent = !info
                ? "Could not check for updates. Check your internet connection."
                : info.updateAvailable
                    ? "An update is available. Follow the update window to install it."
                    : "No newer published release was found (installed v" +
                        info.currentVersion + ", latest published v" +
                        info.latestVersion + "). GitHub code changes are not installable until a new game release is published.";
        });

        this.startScreen.querySelector("#forts-open-settings")
            .addEventListener("click", () => this.openSettings(this.startScreen));
        this.pauseScreen.querySelector("#forts-pause-settings")
            .addEventListener("click", () => this.openSettings(this.pauseScreen));

        this.startScreen.querySelector("#forts-start-button")
            .addEventListener("click", () => this.startGame());

        this.startScreen.querySelectorAll("[data-difficulty]").forEach(button => {
            button.addEventListener("click", () => {
                this.difficulty = button.dataset.difficulty;

                this.startScreen.querySelectorAll("[data-difficulty]")
                    .forEach(item => {
                        item.classList.toggle("active", item === button);
                    });

                if (typeof AI !== "undefined") {
                    AI.setDifficulty(this.difficulty);
                }
            });
        });

        this.pauseScreen.querySelector("#forts-resume-button")
            .addEventListener("click", () => this.resumeGame());

        this.pauseScreen.querySelector("#forts-pause-restart")
            .addEventListener("click", () => this.restartBattle());

        this.pauseScreen.querySelector("#forts-main-menu-button")
            .addEventListener("click", () => this.showMainMenu());

        this.endScreen.querySelector("#forts-end-restart")
            .addEventListener("click", () => this.restartBattle());

        this.endScreen.querySelector("#forts-end-menu")
            .addEventListener("click", () => this.showMainMenu());

        AI.setDifficulty(this.difficulty);

        this.bootScreen = this.createOverlay("cc-boot-screen", `
            <div class="cc-boot-scene cc-boot-game">
                <h1 class="cc-boot-title">Crimson Castle</h1>
                <div class="cc-boot-subtitle">A fortress warfare game</div>
                <div class="cc-version-label" id="cc-boot-version">Loading version...</div>
            </div>

            <div class="cc-boot-scene cc-boot-studio">
                <div class="cc-gear-arrival">
                    <svg class="cc-gear" viewBox="0 0 100 100" aria-label="Over Engineered Games gear logo">
                        <path fill="#292929" stroke="#555" stroke-width="2"
                            d="M43 3h14l3 10a38 38 0 0 1 8 3l9-6 10 10-6 9a38 38 0 0 1 3 8l10 3v14l-10 3a38 38 0 0 1-3 8l6 9-10 10-9-6a38 38 0 0 1-8 3l-3 10H43l-3-10a38 38 0 0 1-8-3l-9 6-10-10 6-9a38 38 0 0 1-3-8L6 53V39l10-3a38 38 0 0 1 3-8l-6-9 10-10 9 6a38 38 0 0 1 8-3z"/>
                        <circle cx="50" cy="46" r="19" fill="#080808" stroke="#555" stroke-width="3"/>
                        <circle cx="50" cy="46" r="8" fill="#292929"/>
                    </svg>
                </div>
                <h2 class="cc-studio-name">Over Engineered Games</h2>
                <div class="cc-studio-caption">Independent Game Development</div>
            </div>
        `);

        this.showOnly(this.startScreen);
        this.loadVersionLabel();
    },

    async loadVersionLabel() {
        // Use the packaged app version when Electron is available.
        // Keep the current project version as a useful fallback in development.
        let version = "1.0.6";
        try {
            if (window.ccUpdater && typeof window.ccUpdater.getVersion === "function") {
                const appVersion = await window.ccUpdater.getVersion();
                if (appVersion) version = String(appVersion);
            }
        } catch (error) {
            console.warn("Could not read game version:", error);
        }

        document.querySelectorAll(".cc-version-label").forEach(label => {
            label.textContent = "v" + version;
        });
    },

    playBootSequence() {
        if (!this.bootScreen) return;

        this.showOnly(this.bootScreen);

        // Fast boot keeps both opening scenes but shortens their timing.
        if (this.preferences.fastBoot) this.bootScreen.classList.add("cc-fast-boot");
        else this.bootScreen.classList.remove("cc-fast-boot");

        // Let the studio ident finish, then fade the main menu in from black.
        window.setTimeout(() => {
            if (window.CCUpdater && typeof window.CCUpdater.finishBoot === "function") {
                window.CCUpdater.finishBoot();
                return;
            }

            this.showOnly(this.startScreen);
            this.startScreen.classList.remove("cc-menu-enter");
            void this.startScreen.offsetWidth;
            this.startScreen.classList.add("cc-menu-enter");
        }, this.preferences.fastBoot ? 2300 : 6450);
    },

    loadPreferences() {
        try {
            const saved = JSON.parse(localStorage.getItem("ccPreferences") || "{}");
            this.preferences.theme = saved.theme === "light" ? "light" : "dark";
            this.preferences.fastBoot = Boolean(saved.fastBoot);
        } catch (error) {
            this.preferences = { theme: "dark", fastBoot: false };
        }
    },

    savePreferences() {
        try { localStorage.setItem("ccPreferences", JSON.stringify(this.preferences)); }
        catch (error) { console.warn("Could not save settings:", error); }
    },

    applyTheme() {
        document.body.classList.toggle("cc-theme-light", this.preferences.theme === "light");
        document.body.classList.toggle("cc-theme-dark", this.preferences.theme !== "light");
    },

    openSettings(returnScreen) {
        this.settingsReturnScreen = returnScreen || this.startScreen;
        this.settingsScreen.querySelector("#cc-theme-select").value = this.preferences.theme;
        this.settingsScreen.querySelector("#cc-fast-boot").checked = this.preferences.fastBoot;
        this.settingsScreen.querySelector("#cc-settings-status").textContent = "";
        this.showOnly(this.settingsScreen);
    },

    createOverlay(id, html) {
        const overlay = document.createElement("div");
        overlay.id = id;
        overlay.className = "forts-overlay";
        overlay.innerHTML = html;

        document.body.appendChild(overlay);
        return overlay;
    },

    showOnly(screen) {
        for (const item of [
            this.startScreen,
            this.pauseScreen,
            this.endScreen,
            this.bootScreen,
            this.settingsScreen
        ]) {
            if (item) item.style.display = "none";
        }

        if (screen) screen.style.display = "flex";
    },

    restartBattle() {
        try {
            sessionStorage.setItem("ccSkipBootOnce", "1");
        } catch (error) {
            // If session storage is unavailable, the game still restarts normally.
        }
        window.location.reload();
    },

    startGame() {
        AI.setDifficulty(this.difficulty);

        this.state = "playing";
        this.lastFrame = performance.now();

        this.showOnly(null);
    },

    pauseGame() {
        if (this.state !== "playing") return;

        this.state = "paused";
        Building.drag = null;

        Weapons.cancelMineDrag();

        this.showOnly(this.pauseScreen);
    },

    resumeGame() {
        if (this.state !== "paused") return;

        this.state = "playing";
        this.lastFrame = performance.now();

        this.showOnly(null);
    },

    showMainMenu() {
        this.state = "menu";

        Building.drag = null;

        Weapons.cancelMineDrag();

        Weapons.selectedTool = null;
        Weapons.selectedCannon = null;
        Weapons.selectedCannons = [];

        if (typeof Weapons.updateToolButtons === "function") {
            Weapons.updateToolButtons();
        }

        this.showOnly(this.startScreen);
    },

    togglePause() {
        if (this.state === "playing") {
            this.pauseGame();
        } else if (this.state === "paused") {
            this.resumeGame();
        }
    },

    setupMobileControls() {
        const controls = document.getElementById("mobile-controls");
        if (!controls) return;
        controls.addEventListener("click", event => {
            const button = event.target.closest("[data-mobile-action]");
            if (!button || this.state !== "playing") return;
            const action = button.dataset.mobileAction;
            const rect = this.canvas.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const panStep = 150 / this.cameraZoom;
            if (action === "pan-left") this.cameraOffsetX -= panStep;
            else if (action === "pan-right") this.cameraOffsetX += panStep;
            else if (action === "pan-up") this.cameraOffsetY -= panStep;
            else if (action === "pan-down") this.cameraOffsetY += panStep;
            else if (action === "zoom-in") this.setCameraZoomAt(centerX, this.cameraZoom * 1.18, centerY);
            else if (action === "zoom-out") this.setCameraZoomAt(centerX, this.cameraZoom / 1.18, centerY);
            else if (action === "fire") {
                const selected = this.selectedCannons.length ? this.selectedCannons :
                    (this.selectedCannon ? [this.selectedCannon] : []);
                for (const cannon of selected) Weapons.fire(cannon);
            } else if (action === "pause") this.togglePause();
            this.clampCamera();
        });
    },

    setupInput() {
        this.canvas.addEventListener("pointerdown", event => {
            if (this.state !== "playing") return;

            if (event.button === 1) {
                this.panDrag = { clientX: event.clientX, clientY: event.clientY };
                this.canvas.setPointerCapture(event.pointerId);
                event.preventDefault();
                return;
            }

            const p = this.mousePosition(event);

            // Right-click no longer deletes anything. Deletion requires
            // explicitly selecting the Delete tool in the toolbar.
            if (event.button !== 0) return;

            this.canvas.setPointerCapture(event.pointerId);

            if (Building.deleteMode) {
                Building.deleteAt(p.x, p.y);
                return;
            }

            if (Building.repairMode) {
                Building.startRepairAt(p.x, p.y, this.difficulty);
                return;
            }

            if (Building.handleUtilityPointerDown(p.x, p.y)) return;
            if (Weapons.handlePointerDown(p.x, p.y, event.ctrlKey)) return;

            Building.startDrag(p.x, p.y);
        });

        this.canvas.addEventListener("pointermove", event => {
            if (this.state !== "playing") return;

            if (this.panDrag) {
                const movementX = event.clientX - this.panDrag.clientX;
                const movementY = event.clientY - this.panDrag.clientY;
                this.panDrag.clientX = event.clientX;
                this.panDrag.clientY = event.clientY;
                this.cameraOffsetX -= movementX / this.cameraZoom;
                this.cameraOffsetY -= movementY / this.cameraZoom;
                this.clampCamera();
                return;
            }

            const p = this.mousePosition(event);
            Building.setMousePosition(p.x, p.y);
            if (Building.repairMode) {
                Building.repairMouse.x = p.x;
                Building.repairMouse.y = p.y;
            }
            Weapons.handlePointerMove(p.x, p.y);
        });

        // Mine placement gets first chance to handle pointer release.
        this.canvas.addEventListener("pointerup", event => {
            if (this.panDrag) {
                this.panDrag = null;
                return;
            }
            if (this.state !== "playing") return;

            const p = this.mousePosition(event);

            if (Weapons.handlePointerUp(p.x, p.y)) return;

            // FIX: Pass the actual release coordinates to Building.
            Building.finishDrag(p.x, p.y);
        });

        this.canvas.addEventListener("pointercancel", () => {
            this.panDrag = null;
            Building.drag = null;
            Weapons.cancelMineDrag();
        });

        // Mouse wheel zooms the battlefield only; the DOM HUD stays at 100%.
        // Shift + wheel and horizontal trackpads move the camera sideways.
        this.canvas.addEventListener("wheel", event => {
            if (this.state !== "playing") return;
            event.preventDefault();

            // Any horizontal wheel/trackpad movement pans sideways.
            // Some mice report horizontal scrolling with deltaX and deltaY
            // together, so do not compare their magnitudes before deciding.
            if (event.deltaX !== 0 || event.shiftKey) {
                const movement = event.deltaX !== 0 ? event.deltaX : event.deltaY;
                this.cameraOffsetX += movement / this.cameraZoom;
                this.clampCamera();
                return;
            }

            // Only a purely vertical wheel gesture controls zoom.
            if (event.deltaY === 0) return;
            const factor = event.deltaY > 0 ? 0.9 : 1.1;
            this.setCameraZoomAt(event.clientX, this.cameraZoom * factor);
        }, { passive: false });

        this.canvas.addEventListener("contextmenu", event => {
            event.preventDefault();
        });

        // Capture keyboard shortcuts even when the canvas or a toolbar button has focus.
        document.addEventListener("keydown", event => {
            if (event.repeat && event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

            if (event.key === "Escape") {
                this.togglePause();
                return;
            }

            if (this.state !== "playing") return;

            const target = event.target;
            const typing = target && (
                target.tagName === "INPUT" ||
                target.tagName === "TEXTAREA" ||
                target.isContentEditable
            );
            if (typing) return;

            if (event.code === "KeyD" || event.key.toLowerCase() === "d") {
                event.preventDefault();
                Building.setDeleteMode(!Building.deleteMode);
                return;
            }

            if (event.key.startsWith("Arrow")) {
                event.preventDefault();
                const step = 90 / this.cameraZoom;
                if (event.key === "ArrowLeft") this.cameraOffsetX -= step;
                else if (event.key === "ArrowRight") this.cameraOffsetX += step;
                else if (event.key === "ArrowUp") this.cameraOffsetY -= step;
                else if (event.key === "ArrowDown") this.cameraOffsetY += step;
                this.clampCamera();
                return;
            }

            if (event.key.toLowerCase() === "q") {
                event.preventDefault();
                this.cycleToolTab(-1);
                return;
            }

            if (event.key.toLowerCase() === "e") {
                event.preventDefault();
                this.cycleToolTab(1);
                return;
            }

            if (event.key >= "1" && event.key <= "9") {
                if (this.selectToolbarItem(Number(event.key))) {
                    event.preventDefault();
                    return;
                }
            }

            if (event.key.toLowerCase() === "g") {
                Building.gridEnabled = !Building.gridEnabled;
            }

            if (event.key.toLowerCase() === "r") {
                Building.setRepairMode(!Building.repairMode, this.difficulty);
                Weapons.selectedCannon = null;
                Weapons.selectedCannons = [];
                Weapons.clearSelectedTool();
            }

        }, true);

        window.addEventListener("resize", () => {
            this.resizeCanvas();
            this.clampCamera();
        });
    },

    checkGameEnd() {
        const playerCoreAlive = Building.nodes.some(node =>
            node.team === "player" &&
            node.isCore &&
            !node.removed
        );

        const enemyCoreAlive = Building.nodes.some(node =>
            node.team === "enemy" &&
            node.isCore &&
            !node.removed
        );

        if (playerCoreAlive && enemyCoreAlive) return false;

        let title = "DRAW";
        let message = "Both forts have been destroyed.";

        if (playerCoreAlive && !enemyCoreAlive) {
            title = "VICTORY!";
            message = "The enemy core has been destroyed!";
        } else if (!playerCoreAlive && enemyCoreAlive) {
            title = "DEFEAT";
            message = "Your core has been destroyed.";
        }

        this.state = "gameover";

        this.endScreen.querySelector("#forts-end-title").textContent = title;
        this.endScreen.querySelector("#forts-end-message").textContent = message;

        this.showOnly(this.endScreen);

        return true;
    },

    drawBackground() {
        const ctx = this.ctx;
        const w = Physics.worldWidth || this.canvas.width;
        const h = this.canvas.height;
        const top = -this.canvas.height;
        const bottom = (Physics.groundY || h * 0.82) + 300;
        const lightMode = this.preferences.theme === "light";
        const sky = ctx.createLinearGradient(0, top, 0, bottom);
        sky.addColorStop(0, lightMode ? "#c8e5f8" : "#72b5e5");
        sky.addColorStop(1, lightMode ? "#f1f7fb" : "#d8e9f4");
        ctx.fillStyle = sky;
        ctx.fillRect(0, top, w, bottom - top);

        const points = Physics.terrainPoints || [];
        if (!points.length) return;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (const point of points) ctx.lineTo(point.x, point.y);
        ctx.lineTo(w, bottom);
        ctx.lineTo(0, bottom);
        ctx.closePath();
        ctx.fillStyle = lightMode ? "#7eaa65" : "#64834c";
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y + 9);
        for (const point of points) ctx.lineTo(point.x, point.y + 9);
        ctx.lineTo(w, bottom);
        ctx.lineTo(0, bottom);
        ctx.closePath();
        ctx.fillStyle = lightMode ? "#a9855f" : "#896a48";
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (const point of points) ctx.lineTo(point.x, point.y);
        ctx.strokeStyle = lightMode ? "#648b50" : "#405c35";
        ctx.lineWidth = 5;
        ctx.stroke();

        // Subtle distant ridgelines give the generated battlefield more depth.
        ctx.save();
        ctx.globalAlpha = 0.16;
        ctx.strokeStyle = lightMode ? "#557b75" : "#c3e0ee";
        ctx.lineWidth = 2;
        for (let layer = 0; layer < 2; layer++) {
            ctx.beginPath();
            for (let x = 0; x <= w; x += 55) {
                const y = h * (0.55 + layer * 0.055) +
                    Math.sin(x * 0.0017 + layer * 2) * 24 +
                    Math.sin(x * 0.004 + layer) * 10;
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
        ctx.restore();
    },

    drawHints() {
        if (window.matchMedia('(max-width: 900px), (pointer: coarse)').matches) return;
        const ctx = this.ctx;

        ctx.save();

        ctx.font = "13px Arial";
        ctx.fillStyle = this.preferences.theme === "light"
            ? "rgba(20,35,48,0.92)"
            : "rgba(255,255,255,0.95)";
        ctx.textAlign = "left";

        ctx.fillText(
            "Drag joint to joint: build beam | Drag beam: extend module",
            14,
            this.canvas.height - 78
        );

        ctx.fillText(
            "Mine / Metal Drill: ground only | Tree Mine: inside a box, produces wood | Windmill: open air | Battery: stores power",
            14,
            this.canvas.height - 58
        );

        ctx.fillText(
            "Wheel: zoom map | Arrow keys: move camera | Middle-drag: pan | G: grid | R: repair | ESC: pause",
            14,
            this.canvas.height - 38
        );

        ctx.fillText(
            Building.repairMode
                ? "REPAIR MODE: click a damaged player beam inside the green circle"
                : "Click a cannon to select; aim and click to fire | Hold mouse with Machine Gun for automatic fire",
            14,
            this.canvas.height - 18
        );

        ctx.restore();
    },

    updateEconomy(delta) {
        const seconds = Math.max(0, delta / 1000);
        const production = Building.getEnergyProduction();
        const drills = Building.installations.filter(item =>
            !item.removed && item.type === "drill"
        );
        const drillPowerDemand = drills.length * Building.utilityDefinitions.drill.powerUse;
        const storedEnergy = Math.max(0, Building.resources.energy);
        const availableEnergy = storedEnergy + production * seconds;
        const requestedEnergy = drillPowerDemand * seconds;
        const drillEfficiency = requestedEnergy > 0
            ? Math.min(1, availableEnergy / requestedEnergy)
            : 1;

        Building.resources.energy = Math.max(0, Math.min(
            Building.getEnergyCapacity(),
            availableEnergy - requestedEnergy * drillEfficiency
        ));

        Building.resources.metal +=
            (CONFIG.METAL_GENERATION || 2) * seconds +
            drills.length * Building.utilityDefinitions.drill.drillRate *
                drillEfficiency * seconds;

        const treeMines = Building.installations.filter(item =>
            !item.removed && item.type === "treeMine"
        );
        Building.resources.wood += treeMines.length *
            Building.utilityDefinitions.treeMine.woodRate * seconds;

        this.resourceTimer += delta;
        if (this.resourceTimer >= 250) {
            this.resourceTimer %= 250;
            Building.updateHUD();
        }
    },

    draw() {
        const ctx = this.ctx;

        ctx.save();

        ctx.translate(-this.cameraX * this.cameraZoom, -this.cameraOffsetY * this.cameraZoom);
        ctx.scale(this.cameraZoom, this.cameraZoom);

        this.drawBackground();
        Building.draw(ctx);
        Weapons.draw(ctx);

        ctx.restore();

        this.drawHints();
    },

    loop(time) {
        if (!this.running) return;

        const delta = Math.min(time - this.lastFrame, 33.333);
        this.lastFrame = time;

        if (this.state === "playing") {
            Physics.update(delta);
            Building.update(delta);
            Weapons.update(delta);
            AI.update(delta);

            this.updateEconomy(delta);

            if (this.checkGameEnd()) {
                this.draw();
                requestAnimationFrame(t => this.loop(t));
                return;
            }
        }

        this.draw();

        requestAnimationFrame(t => this.loop(t));
    }
};

window.addEventListener("load", () => Game.init());