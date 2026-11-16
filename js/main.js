
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

    get cameraX() {
        const worldWidth = Physics.worldWidth || this.canvas.width;
        return Math.max(0, (worldWidth - this.canvas.width) / 2);
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
        Building.init();
        Weapons.init();
        AI.init();

        this.createMenus();
        this.setupInput();

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

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    },

    mousePosition(event) {
        const rect = this.canvas.getBoundingClientRect();

        return {
            x: (event.clientX - rect.left) *
                (this.canvas.width / rect.width) + this.cameraX,
            y: (event.clientY - rect.top) *
                (this.canvas.height / rect.height)
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
                </div>

                <button class="forts-menu-button primary" id="forts-start-button">
                    START BATTLE
                </button>
                <button class="forts-menu-button" id="forts-open-settings">SETTINGS</button>

                <div class="forts-menu-help">
                    Drag between joints to build beams<br>
                    Select Mine, then drag onto a joint to place it<br>
                    Mines cost 50 metal and generate 2 energy per second<br>
                    Cannons cost 100 metal and 50 energy<br>
                    Double-click a cannon to select it; move mouse to aim, click to fire<br>
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
                    : "You're up to date!";
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
        let version = "1.0.0";
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

    setupInput() {
        this.canvas.addEventListener("pointerdown", event => {
            if (this.state !== "playing") return;

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

            if (Weapons.handlePointerDown(p.x, p.y)) return;

            Building.startDrag(p.x, p.y);
        });

        this.canvas.addEventListener("pointermove", event => {
            const p = this.mousePosition(event);

            if (this.state !== "playing") return;

            Building.setMousePosition(p.x, p.y);
            if (Building.repairMode) {
                Building.repairMouse.x = p.x;
                Building.repairMouse.y = p.y;
            }
            Weapons.handlePointerMove(p.x, p.y);
        });

        // Mine placement gets first chance to handle pointer release.
        this.canvas.addEventListener("pointerup", event => {
            if (this.state !== "playing") return;

            const p = this.mousePosition(event);

            if (Weapons.handlePointerUp(p.x, p.y)) return;

            // FIX: Pass the actual release coordinates to Building.
            Building.finishDrag(p.x, p.y);
        });

        this.canvas.addEventListener("pointercancel", () => {
            Building.drag = null;
            Weapons.cancelMineDrag();
        });

        this.canvas.addEventListener("contextmenu", event => {
            event.preventDefault();
        });

        window.addEventListener("keydown", event => {
            if (event.repeat) return;

            if (event.key === "Escape") {
                this.togglePause();
                return;
            }

            if (this.state !== "playing") return;

            if (event.key.toLowerCase() === "g") {
                Building.gridEnabled = !Building.gridEnabled;
            }

            if (event.key.toLowerCase() === "r") {
                Building.setRepairMode(!Building.repairMode, this.difficulty);
                Weapons.selectedCannon = null;
                Weapons.clearSelectedTool();
            }

            if (event.key === "1") {
                Building.setMaterial("wood");
            }

            if (event.key === "2") {
                Building.setMaterial("steel");
            }
        });

        window.addEventListener("resize", () => this.resizeCanvas());
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
        const groundY = Physics.groundY;

        const sky = ctx.createLinearGradient(0, 0, 0, h);

        const lightMode = this.preferences.theme === "light";
        sky.addColorStop(0, lightMode ? "#c8e5f8" : "#72b5e5");
        sky.addColorStop(1, lightMode ? "#f1f7fb" : "#d8e9f4");

        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = lightMode ? "#b3cf9b" : "#94b77b";
        ctx.beginPath();
        ctx.moveTo(0, groundY);

        for (let x = 0; x <= w + 40; x += 40) {
            const y =
                h * 0.70 +
                Math.sin(x * 0.004) * 25 +
                Math.sin(x * 0.011) * 12;

            ctx.lineTo(x, y);
        }

        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = lightMode ? "#7eaa65" : "#64834c";
        ctx.fillRect(0, groundY, w, h - groundY);

        ctx.fillStyle = lightMode ? "#a9855f" : "#896a48";
        ctx.fillRect(0, groundY + 12, w, h - groundY - 12);

        ctx.fillStyle = lightMode ? "#648b50" : "#405c35";
        ctx.fillRect(0, groundY, w, 5);
    },

    drawHints() {
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
            "Mine: select Mine, drag onto a joint | 50 metal, +2 energy/sec",
            14,
            this.canvas.height - 58
        );

        ctx.fillText(
            "Select DELETE tool before removing pieces | G: grid | R: repair mode | 1: wood | 2: steel | ESC: pause",
            14,
            this.canvas.height - 38
        );

        ctx.fillText(
            Building.repairMode
                ? "REPAIR MODE: click a damaged player beam inside the green circle"
                : "Double-click cannon to select; move mouse to aim, click to fire",
            14,
            this.canvas.height - 18
        );

        ctx.restore();
    },

    updateEconomy(delta) {
        this.resourceTimer += delta;

        const tickRate = CONFIG.RESOURCE_TICK_RATE || 1000;

        while (this.resourceTimer >= tickRate) {
            this.resourceTimer -= tickRate;

            Building.resources.metal += CONFIG.METAL_GENERATION || 2;

            const activeMines = (Building.mines || []).filter(mine =>
                mine &&
                !mine.removed &&
                mine.node &&
                !mine.node.removed
            );

            const energyPerSecond = activeMines.reduce(
                (total, mine) => total + (mine.energyPerSecond || 2),
                0
            );

            Building.resources.energy +=
                energyPerSecond * (tickRate / 1000);

            Building.updateHUD();
        }
    },

    draw() {
        const ctx = this.ctx;

        ctx.save();

        ctx.translate(-this.cameraX, 0);

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