
"use strict";

var Game = window.Game = {
    canvas: null,
    ctx: null,

    running: false,
    state: "menu",
    mapInitialized: false,
    selectedMap: "base",

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
        // Allow substantially more upward camera travel so tall Mountain Map
        // terrain and elevated structures can be inspected on mobile and desktop.
        const upperPanLimit = -this.canvas.height * 1.5;
        this.cameraOffsetY = Math.max(upperPanLimit,
            Math.min(Math.max(upperPanLimit, worldBottom + mobileVerticalRoom - visibleHeight), this.cameraOffsetY));
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

    enterDrillBotCamera(bot) {
        if (!this.drillBotCameraState) {
            this.drillBotCameraState = { zoom: this.cameraZoom, x: this.cameraOffsetX, y: this.cameraOffsetY };
        }
        document.body.classList.add("cc-drill-bot-mode");
        this.cameraZoom = this.isMobileViewport ? 0.32 : 0.55;
        this.updateDrillBotCamera(bot);
    },

    updateDrillBotCamera(bot) {
        if (!bot || !this.drillBotCameraState) return;
        const visibleWidth = this.canvas.width / this.cameraZoom;
        const visibleHeight = this.canvas.height / this.cameraZoom;
        this.cameraOffsetX = bot.x - visibleWidth / 2;
        this.cameraOffsetY = bot.y - visibleHeight / 2;
        this.clampCamera();
    },

    exitDrillBotCamera() {
        if (!this.drillBotCameraState) return;
        const previous = this.drillBotCameraState;
        this.drillBotCameraState = null;
        document.body.classList.remove("cc-drill-bot-mode");
        this.cameraZoom = previous.zoom;
        this.cameraOffsetX = previous.x;
        this.cameraOffsetY = previous.y;
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

        // Keep the title/menu backdrop lightweight. The actual battlefield,
        // physics world, player fort, weapons and AI are created only after
        // the player selects a map.
        this.isMobileViewport = window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
        this.cameraZoom = this.isMobileViewport ? 0.42 : 0.78;
        this.cameraOffsetX = 0;
        this.cameraOffsetY = 0;

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

        // Enforce mutually exclusive tool modes at the toolbar boundary.
        // Capture phase runs before individual button handlers, so even a
        // weapon button whose handler is replaced later cannot leave Door mode active.
        if (!toolbar.dataset.doorModeGuard) {
            toolbar.dataset.doorModeGuard = "true";
            toolbar.addEventListener("click", event => {
                const tool = event.target.closest(".tool[data-tool-category]");
                if (!tool || !toolbar.contains(tool)) return;
                if (tool.dataset.toolCategory !== "weapons") return;
                if (typeof Building === "undefined" || !Building.doorMaterial) return;

                Building.doorMaterial = null;
                Building.doorModifierDrag = null;
                Building.drag = null;
                if (Building.hideDoorConfirm) Building.hideDoorConfirm();
                Building.updateToolbar();
            }, true);
        }

        this.activeToolTab = "build";

        this.selectToolTab = category => {
            if (!tabs.some(tab => tab.dataset.toolTab === category)) return;

            this.activeToolTab = category;
            if (category !== "tools") {
                const flakPanel = document.getElementById("flak-settings-panel");
                if (flakPanel) flakPanel.hidden = true;
            }
            tabs.forEach(tab => {
                const selected = tab.dataset.toolTab === category;
                tab.classList.toggle("active", selected);
                tab.setAttribute("aria-selected", String(selected));
            });

            toolbar.querySelectorAll(".tool").forEach(tool => {
                tool.hidden = tool.dataset.toolCategory !== category || (tool.id === "btn-flak-cannon" && !(window.Weapons && Weapons.isResearched("flakCannon"))) || (tool.id === "btn-drill-bot" && !(window.Weapons && Weapons.isResearched("drillBot"))) || (tool.id === "btn-melter" && !(window.Weapons && Weapons.isResearched("melter")));
            });

            // Apply weapon-specific visibility after the general tab filter.
            if (window.Weapons && window.Weapons.refreshFlakSettingsUI) window.Weapons.refreshFlakSettingsUI();
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

        // Explicitly bind the BUILD door choices after the toolbar tabs
        // initialize, so the buttons always activate the placement mode.
        const woodDoor = document.getElementById("btn-wood-door");
        const selectTool = document.getElementById("btn-select-tool");
        if (selectTool) selectTool.addEventListener("click", () => {
            if (typeof Building !== "undefined") Building.setSelectMode(!Building.selectMode);
        });

        const steelDoor = document.getElementById("btn-steel-door");
        if (woodDoor) woodDoor.addEventListener("click", () => {
            if (typeof Building !== "undefined") Building.setDoorMaterial("wood");
        });
        if (steelDoor) steelDoor.addEventListener("click", () => {
            if (typeof Building !== "undefined") Building.setDoorMaterial("steel");
        });

        this.selectToolTab("build");
    },

    resizeCanvas() {
        // Match the drawing buffer to the canvas's actual visible size.
        // Mobile browsers can report a narrower layout viewport than the visible canvas.
        const rect = this.canvas.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width || window.innerWidth));
        const height = Math.max(1, Math.round(rect.height || window.innerHeight));
        this.canvas.width = width;
        this.canvas.height = height;
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

            .cc-map-menu-card {
                width:min(760px,100%);
                max-height:min(90vh,820px);
                overflow:auto;
                padding:clamp(22px,4vw,36px);
            }
            .cc-map-grid {
                display:grid;
                grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr));
                gap:14px;
                margin:20px 0;
                text-align:left;
            }
            .cc-map-option {
                padding:12px;
                border:2px solid #71869a;
                border-radius:10px;
                background:rgba(8,18,29,.55);
            }
            .cc-map-preview {
                position:relative;
                height:150px;
                overflow:hidden;
                border:1px solid #637b91;
                border-radius:7px;
                background:linear-gradient(180deg,#17334e 0%,#4f83a7 65%,#1a2b3b 66%,#263c32 100%);
            }
            .cc-map-preview:before {
                content:"";
                position:absolute;
                left:-8%;
                right:-8%;
                bottom:18px;
                height:65px;
                background:linear-gradient(160deg,transparent 0 20%,#5f7d52 21% 45%,#354d3d 46% 100%);
                clip-path:polygon(0 72%,12% 48%,23% 72%,77% 72%,88% 48%,100% 72%,100% 100%,0 100%);
                opacity:.9;
            }
            .cc-map-preview:after {
                content:"";
                position:absolute;
                left:0;
                right:0;
                bottom:0;
                height:20px;
                background:#1b2c28;
            }
            .cc-map-preview-label {
                position:absolute;
                z-index:1;
                top:10px;
                left:12px;
                color:#f1f6fb;
                font-size:10px;
                font-weight:800;
                letter-spacing:2px;
                text-shadow:0 2px 5px #07111d;
            }
            .cc-map-option h2 {
                margin:12px 0 5px;
                color:#f1c45c;
                font-size:19px;
            }
            .cc-map-option p {
                min-height:38px;
                color:#c4d2df;
                font-size:13px;
                line-height:1.45;
            }
            .cc-map-status {
                color:#e7c56f;
                font-size:12px;
                min-height:18px;
            }
            @media (max-width:520px) {
                .cc-map-preview { height:125px; }
                .cc-map-menu-card { padding:20px 16px; }
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
                    Solar panels provide cheap steady power; water drillers need ground joints and power<br>
                    Store drilled water, then use geothermal generators to turn water into high power<br>
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

        this.mapSelectScreen = this.createOverlay("forts-map-select-screen", `
            <div class="forts-menu-card cc-map-menu-card">
                <div class="forts-pause-label">BATTLE SETUP</div>
                <h1 class="forts-menu-title">SELECT MAP</h1>
                <p class="forts-menu-subtitle">
                    Choose the battlefield for your match. Your selected difficulty is already set.
                </p>
                <div class="cc-map-grid">
                    <div class="cc-map-option">
                        <div class="cc-map-preview" role="img" aria-label="Preview of the original battlefield">
                            <span class="cc-map-preview-label">ORIGINAL BATTLEFIELD</span>
                        </div>
                        <h2>Base Map</h2>
                        <p>The original Crimson Castle battlefield.</p>
                        <button class="forts-menu-button primary" id="cc-select-base-map">
                            SELECT BASE MAP
                        </button>
                    </div>
                    <div class="cc-map-option">
                        <div class="cc-map-preview" role="img" aria-label="Early preview of the Mountain Map">
                            <span class="cc-map-preview-label">MOUNTAIN MAP PROTOTYPE</span>
                        </div>
                        <h2>Mountain Map</h2>
                        <p>Prototype selection. Uses the existing battlefield until its new terrain is built.</p>
                        <button class="forts-menu-button primary" id="cc-select-mountain-map">
                            SELECT MOUNTAIN MAP
                        </button>
                    </div>
                </div>
                <div class="cc-map-status" id="cc-map-status" aria-live="polite">
                    2 maps available
                </div>
                <button class="forts-menu-button" id="cc-map-back">BACK TO DIFFICULTY</button>
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

        this.mapSelectScreen.querySelector("#cc-map-back")
            .addEventListener("click", () => this.showOnly(this.startScreen));
        this.mapSelectScreen.querySelector("#cc-select-base-map")
            .addEventListener("click", () => this.loadSelectedMap("base"));
        this.mapSelectScreen.querySelector("#cc-select-mountain-map")
            .addEventListener("click", () => this.loadSelectedMap("mountain"));

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
        let version = "1.1.0";
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
            this.mapSelectScreen,
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
        // Difficulty is chosen first; map selection comes before any battlefield
        // is constructed or any default terrain is loaded.
        this.showOnly(this.mapSelectScreen);
    },

    loadSelectedMap(mapId) {
        if (mapId !== "base" && mapId !== "mountain") return;

        // If the player returns to the menu after a battle, reuse the already
        // loaded Base Map instead of initializing a second physics world.
        if (this.mapInitialized) {
            AI.setDifficulty(this.difficulty);
            if (AI.fortCreated && AI.fortDifficulty !== this.difficulty) {
                AI.resetEnemyFort();
            }
            if (!AI.fortCreated) AI.createEnemyFort();
            this.state = "playing";
            this.lastFrame = performance.now();
            this.showOnly(null);
            return;
        }

        const status = this.mapSelectScreen.querySelector("#cc-map-status");
        const button = this.mapSelectScreen.querySelector("#cc-select-base-map");
        const mountainButton = this.mapSelectScreen.querySelector("#cc-select-mountain-map");
        button.disabled = true;
        mountainButton.disabled = true;
        status.textContent = "Loading selected map...";

        try {
            this.selectedMap = mapId;
            Physics.init(this.selectedMap);

            // Construct the existing battlefield only after explicit selection.
            this.cameraZoom = this.isMobileViewport ? 0.5 : 1;
            const visibleWorldWidth = this.canvas.width / this.cameraZoom;
            this.cameraOffsetX = Math.max(0, (Physics.worldWidth - visibleWorldWidth) / 2);
            this.cameraOffsetY = this.isMobileViewport ? -this.canvas.height * 0.75 : 0;
            this.clampCamera();

            Building.init();
            Weapons.init();
            if (window.DrillBot) DrillBot.init();
            AI.init();
            AI.setDifficulty(this.difficulty);
            AI.createEnemyFort();

            this.mapInitialized = true;
            this.state = "playing";
            this.lastFrame = performance.now();
            this.showOnly(null);
        } catch (error) {
            console.error("Could not load selected map:", error);
            status.textContent = "The map could not be loaded. Please try again.";
            button.disabled = false;
            mountainButton.disabled = false;
        }
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

        const groupButton = controls.querySelector('[data-mobile-action="group-select"]');
        // Group selection is useful on both the Android app and the mobile web version.
        let groupSelectPointerId = null;
        if (groupButton) groupButton.hidden = false;

        document.addEventListener("pointerdown", event => {
            const target = event.target instanceof Element ? event.target.closest('[data-mobile-action="group-select"]') : null;
            if (!target || this.state !== "playing") return;
            event.preventDefault();
            event.stopPropagation();
            groupSelectPointerId = event.pointerId;
            Weapons.groupSelectMode = true;
            target.classList.add("active");
        }, true);
        const releaseGroupSelect = event => {
            if (!Weapons.groupSelectMode) return;
            if (event && Number.isFinite(event.pointerId) && event.pointerId !== groupSelectPointerId) return;
            groupSelectPointerId = null;
            Weapons.groupSelectMode = false;
            if (groupButton) groupButton.classList.remove("active");
        };
        document.addEventListener("pointerup", releaseGroupSelect, true);
        document.addEventListener("pointercancel", releaseGroupSelect, true);
        window.addEventListener("blur", releaseGroupSelect);

        // Listen at document capture level: this runs before canvas handlers and
        // remains reliable even if an ancestor's delegated event path is disrupted.
        // The button itself is resolved from the composed event path for Android.
        document.addEventListener("pointerdown", event => {
            const path = typeof event.composedPath === "function" ? event.composedPath() : [];
            const button = path.find(node =>
                node instanceof Element && node.matches('[data-mobile-action="deselect"]')
            ) || (event.target instanceof Element
                ? event.target.closest('[data-mobile-action="deselect"]')
                : null);
            if (!button || this.state !== "playing") return;

            event.preventDefault();
            event.stopPropagation();
            const before = {
                selectedCannon: !!Weapons.selectedCannon,
                selectedCannons: Weapons.selectedCannons ? Weapons.selectedCannons.length : 0
            };
            const resetPassed = typeof Weapons.forceDeselectGuns === "function"
                ? Weapons.forceDeselectGuns()
                : (Weapons.clearSelectedCannon(), true);
            const after = {
                selectedCannon: !!Weapons.selectedCannon,
                selectedCannons: Weapons.selectedCannons ? Weapons.selectedCannons.length : 0
            };
            if (window.CCDebug) {
                window.CCDebug.report(
                    "MOBILE_DESELECT",
                    (resetPassed && !after.selectedCannon && after.selectedCannons === 0) ? "PASS" : "FAIL",
                    "X pointerdown handled; selected weapon state " +
                        (after.selectedCannon || after.selectedCannons ? "remains active." : "cleared."),
                    { before, after, buttonRect: (() => {
                        const r = button.getBoundingClientRect();
                        return { x: +r.x.toFixed(1), y: +r.y.toFixed(1),
                            width: +r.width.toFixed(1), height: +r.height.toFixed(1) };
                    })() }
                );
            }
        }, true);

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
            else if (action === "deselect") {
                // Deselect is handled on pointerdown for reliable touch behavior.
            } else if (action === "pause") this.togglePause();
            this.clampCamera();
        });
    },

    renderResearchCategory(category) {
        const panel = document.getElementById("research-menu");
        if (!panel) return;
        const projects = panel.querySelector(".research-projects");
        if (!projects) return;
        if (category === "weapons") {
            projects.innerHTML = `
                <h3>Weapon Research</h3>
                <article class="research-project" data-project="flakCannon">
                    <div><strong>Flak Cannon</strong><p>Unlocks the Flak Cannon weapon</p><small>40 Metal • 10 seconds</small></div>
                    <button type="button" class="research-start" data-start-research="flakCannon">Research</button>
                    <p class="research-project-status" aria-live="polite"></p>
                </article>`;
            projects.querySelector("[data-start-research='flakCannon']").addEventListener("click", () => {
                Weapons.startResearch("flakCannon");
                this.refreshResearchMenu();
            });
            this.refreshResearchMenu();
        } else if (category === "buildings") {
            projects.innerHTML = `
                <h3>Building Research</h3>
                <p class="research-empty">No building research projects are available yet.</p>`;
            this.refreshResearchMenu();
        } else if (category === "machinery") {
            projects.innerHTML = `
                <h3>Machinery Research</h3>
                <article class="research-project" data-project="melter">
                    <div><strong>Melter</strong><p>Unlocks the existing Melter, which processes queued Metal and Energy over time and adds Titanium to your stored resources.</p><small>120 Metal • 20 seconds</small></div>
                    <button type="button" class="research-start" data-start-research="melter">Research</button>
                    <p class="research-project-status" aria-live="polite"></p>
                </article>`;
            projects.querySelector("[data-start-research='melter']").addEventListener("click", () => {
                Weapons.startResearch("melter");
                this.refreshResearchMenu();
            });
            this.refreshResearchMenu();
        } else if (category === "bots") {
            projects.innerHTML = `
                <h3>Bot Research</h3>
                <article class="research-project" data-project="drillBot">
                    <div><strong>Drill Bot</strong><p>Unlocks the Drill Bot construction ability</p><small>70 Metal • 15 seconds</small></div>
                    <button type="button" class="research-start" data-start-research="drillBot">🔒 Research</button>
                    <p class="research-project-status" aria-live="polite"></p>
                </article>`;
            projects.querySelector("[data-start-research='drillBot']").addEventListener("click", () => {
                Weapons.startResearch("drillBot");
                this.refreshResearchMenu();
            });
            this.refreshResearchMenu();
        }
    },

    refreshResearchMenu() {
        const panel = document.getElementById("research-menu");
        if (!panel) return;
        panel.querySelectorAll("[data-start-research]").forEach(button => {
            const projectId = button.dataset.startResearch;
            const project = Weapons.researchProjects[projectId];
            const status = button.closest(".research-project")?.querySelector(".research-project-status");
            if (!project || !status) return;
            if (project.unlocked) {
                button.textContent = "Researched";
                button.disabled = true;
                status.textContent = (project.name || (projectId === "drillBot" ? "Drill Bot" : projectId === "melter" ? "Melter" : "Flak Cannon")) + " unlocked.";
            } else if (project.researching) {
                button.textContent = projectId === "drillBot" ? "🔒 Researching…" : "Researching…";
                button.disabled = true;
                status.textContent = "Progress: " + project.progress.toFixed(1) + " / " + project.duration + " seconds";
            } else {
                button.textContent = projectId === "drillBot" ? "🔒 Research" : "Research";
                button.disabled = Building.resources.metal < project.metalCost;
                status.textContent = button.disabled
                    ? "Need " + project.metalCost + " Metal to begin."
                    : "Ready to research.";
            }
        });
    },

    openResearchMenu() {
        let panel = document.getElementById("research-menu");
        if (!panel) {
            panel = document.createElement("section");
            panel.id = "research-menu";
            panel.className = "research-menu-overlay";
            panel.setAttribute("role", "dialog");
            panel.setAttribute("aria-modal", "true");
            panel.setAttribute("aria-labelledby", "research-menu-title");
            panel.innerHTML = `
                <div class="research-menu">
                    <header class="research-menu-header">
                        <div><p class="research-eyebrow">CRIMSON CASTLE</p><h2 id="research-menu-title">Research Station</h2></div>
                        <button type="button" class="research-close" aria-label="Close research menu">×</button>
                    </header>
                    <p class="research-intro">Choose a field to explore.</p>
                    <div class="research-categories" role="group" aria-label="Research categories">
                        <button type="button" class="selected" data-research-category="weapons">Weapons</button>
                        <button type="button" data-research-category="buildings">Buildings</button>
                        <button type="button" data-research-category="machinery">Machinery</button>
                        <button type="button" data-research-category="bots">Bots</button>
                    </div>
                    <div class="research-projects"></div>
                    <footer class="research-menu-footer"><span>Research generation: 0.5 points/sec per station</span><button type="button" class="research-done">Close</button></footer>
                </div>`;
            document.body.appendChild(panel);
            const close = () => { panel.hidden = true; };
            panel.querySelector(".research-close").addEventListener("click", close);
            panel.querySelector(".research-done").addEventListener("click", close);
            panel.addEventListener("click", event => { if (event.target === panel) close(); });
            panel.querySelectorAll("[data-research-category]").forEach(button => {
                button.addEventListener("click", () => {
                    panel.querySelectorAll("[data-research-category]").forEach(item =>
                        item.classList.toggle("selected", item === button)
                    );
                    this.renderResearchCategory(button.dataset.researchCategory);
                });
            });
        }
        panel.hidden = false;
        this.renderResearchCategory("weapons");
        panel.querySelector(".research-close").focus();
    },

    openMelterMenu(melter) {
        let panel = document.getElementById("melter-menu");
        if (!panel) {
            panel = document.createElement("section");
            panel.id = "melter-menu";
            panel.className = "research-menu-overlay melter-menu-overlay";
            panel.setAttribute("role", "dialog");
            panel.setAttribute("aria-modal", "true");
            panel.setAttribute("aria-labelledby", "melter-menu-title");
            panel.innerHTML = `
                <div class="research-menu melter-menu">
                    <header class="research-menu-header">
                        <div><p class="research-eyebrow">MACHINERY CONTROL</p><h2 id="melter-menu-title">Melter</h2></div>
                        <button type="button" class="research-close" aria-label="Close Melter menu">×</button>
                    </header>
                    <p class="research-intro">Queue Metal for this Melter to process over time. Each completed cycle adds Titanium to your stored resource total.</p>
                    <div class="melter-controls">
                        <label class="melter-amount">
                            <span>Metal to use</span>
                            <input id="melter-metal-input" type="number" min="1" step="1" value="1" inputmode="numeric">
                        </label>
                        <div class="melter-output" aria-live="polite">
                            <span>Titanium added to storage</span>
                            <strong id="melter-titanium-preview">0.5</strong>
                            <small>Stored Titanium • 1 per steel beam upgrade</small>
                        </div>
                    </div>
                    <div class="melter-energy-line"><span>Energy needed:</span><strong id="melter-energy-needed">10</strong></div>
                    <div class="melter-energy-line"><span>Time needed:</span><strong id="melter-time-needed">0.7 sec</strong></div>
                    <p class="melter-status" id="melter-menu-status">Ready to smelt.</p>
                    <footer class="research-menu-footer">
                        <span>0.5 Titanium per Metal • 10 Energy per Metal • 0.7 sec per cycle</span>
                        <button type="button" class="research-done melter-start">Start smelting</button>
                    </footer>
                </div>`;
            document.body.appendChild(panel);
            const close = () => { panel.hidden = true; };
            panel.querySelector(".research-close").addEventListener("click", close);
            panel.addEventListener("click", event => { if (event.target === panel) close(); });
            panel.querySelector(".melter-start").addEventListener("click", () => {
                const selected = this.activeMelter;
                const amount = Math.floor(Number(panel.querySelector("#melter-metal-input").value));
                if (!selected || selected.removed || !Building.installations.includes(selected)) {
                    panel.querySelector("#melter-menu-status").textContent = "This Melter is no longer available.";
                    return;
                }
                if (!Number.isFinite(amount) || amount < 1) {
                    panel.querySelector("#melter-menu-status").textContent = "Enter at least 1 Metal.";
                    return;
                }
                const energyCost = amount * Building.utilityDefinitions.melter.energyPerCycle;
                if (Building.resources.metal < amount) {
                    panel.querySelector("#melter-menu-status").textContent = "Not enough Metal. You have " + Math.floor(Building.resources.metal) + ".";
                    return;
                }
                if (Building.resources.energy < energyCost) {
                    panel.querySelector("#melter-menu-status").textContent = "Not enough Energy. Need " + energyCost + ".";
                    return;
                }
                // Reserve the full order up front so other systems cannot spend
                // the Melter's inputs while it is processing.
                Building.resources.metal -= amount;
                Building.resources.energy -= energyCost;
                selected.smeltRemainingMetal = amount;
                selected.processTimer = 0;
                selected.operating = true;
                Building.updateHUD();
                panel.querySelector("#melter-menu-status").textContent = "Smelting order started: " + amount + " Metal.";
                Building.showPlacementMessage("Melter order started: " + amount + " Metal.");
            });
            panel.querySelector("#melter-metal-input").addEventListener("input", () => this.updateMelterPreview());
        }
        this.activeMelter = melter;
        const input = panel.querySelector("#melter-metal-input");
        input.value = "1";
        input.max = Math.max(1, Math.floor(Building.resources.metal));
        const status = panel.querySelector("#melter-menu-status");
        status.textContent = melter.smeltRemainingMetal > 0
            ? "Order in progress: " + melter.smeltRemainingMetal + " Metal remaining."
            : "Ready to smelt.";
        panel.hidden = false;
        this.updateMelterPreview();
        input.focus();
        input.select();
    },

    updateMelterPreview() {
        const panel = document.getElementById("melter-menu");
        if (!panel) return;
        const raw = Number(panel.querySelector("#melter-metal-input").value);
        const amount = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
        const recipe = Building.utilityDefinitions.melter;
        panel.querySelector("#melter-titanium-preview").textContent =
            (amount * recipe.titaniumPerCycle).toFixed(1);
        panel.querySelector("#melter-energy-needed").textContent =
            (amount * recipe.energyPerCycle).toLocaleString();
        const totalSeconds = amount * recipe.cycleSeconds;
        panel.querySelector("#melter-time-needed").textContent =
            totalSeconds.toFixed(1) + (totalSeconds === 1 ? " sec" : " sec");
    },

    setupInput() {
        this.canvas.addEventListener("pointerdown", event => {
            if (this.state !== "playing") return;

            if (event.button === 1) {
                this.panDrag = { clientX: event.clientX, clientY: event.clientY };
                this.canvas.setPointerCapture(event.pointerId);
                this.activeCanvasPointerId = event.pointerId;
                event.preventDefault();
                return;
            }

            const p = this.mousePosition(event);

            // Right-click no longer deletes anything. Deletion requires
            // explicitly selecting the Delete tool in the toolbar.
            if (event.button !== 0) return;

            this.canvas.setPointerCapture(event.pointerId);
            // Track the active canvas gesture so release is still handled if
            // Android retargets the pointer outside the canvas or viewport.
            this.activeCanvasPointerId = event.pointerId;

            if (window.DrillBot && DrillBot.handlePointerDown(p.x, p.y)) return;

            if (Building.selectMode) {
                const station = [...Building.installations].reverse().find(item =>
                    !item.removed && item.type === "researchStation" &&
                    Building.installationHitTest(item, p.x, p.y)
                );
                if (station) this.openResearchMenu();
                else Building.showPlacementMessage("Tap a Research Station to open its research menu.");
                return;
            }

            if (Building.doorMaterial && Building.startDoorModifier(p.x, p.y)) return;

            // Tapping a placed Melter opens its production controls.
            if (!Building.deleteMode && !Building.repairMode && !Building.upgradeMode && !Weapons.linkMode) {
                const melter = [...Building.installations].reverse().find(item =>
                    !item.removed && item.type === "melter" &&
                    Building.installationHitTest(item, p.x, p.y)
                );
                if (melter) {
                    this.openMelterMenu(melter);
                    return;
                }
            }

            // A placed Research Station is an interactive world object. Check
            // it before utility placement so tapping it opens its menu instead.
            if (!Building.deleteMode && !Building.repairMode && !Weapons.linkMode) {
                const station = [...Building.installations].reverse().find(item =>
                    !item.removed && item.type === "researchStation" &&
                    Building.installationHitTest(item, p.x, p.y)
                );
                if (station) {
                    this.openResearchMenu();
                    return;
                }
            }

            if (Building.deleteMode) {
                Building.deleteAt(p.x, p.y);
                return;
            }

            if (Building.repairMode) {
                Building.startRepairAt(p.x, p.y, this.difficulty);
                return;
            }

            if (Building.upgradeMode) {
                Building.upgradeBeamAt(p.x, p.y);
                return;
            }

            if (Weapons.linkMode && Weapons.handleLinkPointerDown(p.x, p.y)) return;
            if (Building.handleUtilityPointerDown(p.x, p.y)) return;
            if (Weapons.handlePointerDown(p.x, p.y, event.ctrlKey || Weapons.groupSelectMode)) return;

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
            if (Weapons.linkMode) {
                // Link mode only updates the guide position. Skip all
                // building/repair drag processing while the tool is active.
                Weapons.handlePointerMove(p.x, p.y);
                return;
            }
            Building.moveDoorModifier(p.x, p.y);
            Building.setMousePosition(p.x, p.y);
            if (Building.repairMode) {
                Building.repairMouse.x = p.x;
                Building.repairMouse.y = p.y;
            }
            Weapons.handlePointerMove(p.x, p.y);
        });

        // Keep touch interactions reliable even if the browser routes the
        // release outside the canvas after pointer capture is interrupted.
        const finishDoorPointer = () => {
            if (Building.doorModifierDrag && !Building.doorModifierDrag.released) {
                Building.releaseDoorModifier();
            }
        };
        // Listen at document level because Android may retarget a touch release
        // after pointer capture or when the finger leaves the canvas.
        document.addEventListener("pointerup", finishDoorPointer, true);
        document.addEventListener("touchend", finishDoorPointer, { capture: true, passive: true });
        document.addEventListener("mouseup", finishDoorPointer, true);

        // Handle release at document level. Android may send the release
        // outside the canvas after a finger leaves the visible game area.
        document.addEventListener("pointerup", event => {
            if (this.activeCanvasPointerId !== event.pointerId) return;
            this.activeCanvasPointerId = null;

            if (this.panDrag) {
                this.panDrag = null;
                return;
            }
            if (this.state !== "playing") return;

            const p = this.mousePosition(event);

            if (Building.releaseDoorModifier()) return;
            if (Weapons.handlePointerUp(p.x, p.y)) return;

            // Pass the actual release coordinates to Building.
            Building.finishDrag(p.x, p.y);
        }, true);

        // Some mobile browsers emit pointercancel rather than pointerup when
        // a touch leaves the viewport. Treat an active Sniper aim as released
        // so the separate FIRE control is still presented.
        document.addEventListener("pointercancel", event => {
            if (this.activeCanvasPointerId !== event.pointerId) return;
            this.activeCanvasPointerId = null;
            this.panDrag = null;

            if (Weapons.sniperAimDrag) {
                Weapons.cancelSniperAim();
                return;
            }

            Building.drag = null;
            Building.doorModifierDrag = null;
            Building.hideDoorConfirm();
            Weapons.cancelMineDrag();
            Weapons.cancelSniperAim();
        }, true);

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
            "Metal / Water Drills: ground only | Solar + Wind: power | Water Storage: holds water | Geothermal: water to power",
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
        const waterDrills = Building.installations.filter(item =>
            !item.removed && item.type === "waterDrill"
        );
        const geothermal = Building.installations.filter(item =>
            !item.removed && item.type === "geothermal"
        );
        const activeGeothermal = Building.resources.water > 0 ? geothermal : [];
        const metalPowerDemand = drills.length * Building.utilityDefinitions.drill.powerUse;
        const waterPowerDemand = waterDrills.length * Building.utilityDefinitions.waterDrill.powerUse;
        const geothermalPowerDemand = activeGeothermal.length * Building.utilityDefinitions.geothermal.powerUse;
        const totalPowerDemand = metalPowerDemand + waterPowerDemand + geothermalPowerDemand;
        const storedEnergy = Math.max(0, Building.resources.energy);
        const availableEnergy = storedEnergy + production * seconds;
        const requestedEnergy = totalPowerDemand * seconds;
        const powerEfficiency = requestedEnergy > 0
            ? Math.min(1, availableEnergy / requestedEnergy)
            : 1;

        const geothermalOutput = activeGeothermal.length *
            Building.utilityDefinitions.geothermal.output * powerEfficiency;
        Building.resources.energy = Math.max(0, Math.min(
            Building.getEnergyCapacity(),
            availableEnergy - requestedEnergy * powerEfficiency +
                geothermalOutput * seconds
        ));

        // The Melter reserves Metal and Energy when an order starts, then
        // converts the reserved Metal into stored Titanium over time.
        for (const melter of Building.installations.filter(item =>
            !item.removed && item.type === "melter"
        )) {
            const recipe = Building.utilityDefinitions.melter;
            if ((melter.smeltRemainingMetal || 0) <= 0) {
                melter.smeltRemainingMetal = 0;
                melter.processTimer = 0;
                melter.operating = false;
                continue;
            }

            melter.operating = true;
            melter.processTimer = (melter.processTimer || 0) + seconds;
            while (melter.processTimer >= recipe.cycleSeconds &&
                melter.smeltRemainingMetal > 0) {
                melter.processTimer -= recipe.cycleSeconds;
                Building.resources.titanium = (Building.resources.titanium || 0) +
                    recipe.titaniumPerCycle;
                melter.smeltRemainingMetal -= recipe.metalPerCycle;
            }
            if (melter.smeltRemainingMetal <= 0) {
                melter.smeltRemainingMetal = 0;
                melter.processTimer = 0;
                melter.operating = false;
            }
        }

        Building.resources.metal +=
            (CONFIG.METAL_GENERATION || 2) * seconds +
            drills.length * Building.utilityDefinitions.drill.drillRate *
                powerEfficiency * seconds;

        Building.resources.water = Math.min(
            Building.getWaterCapacity(),
            Math.max(0, Building.resources.water) +
                waterDrills.length * Building.utilityDefinitions.waterDrill.waterRate *
                    powerEfficiency * seconds -
                activeGeothermal.length * Building.utilityDefinitions.geothermal.waterUse *
                    powerEfficiency * seconds
        );

        const treeMines = Building.installations.filter(item =>
            !item.removed && item.type === "treeMine"
        );
        Building.resources.wood += treeMines.length *
            Building.utilityDefinitions.treeMine.woodRate * seconds;

        const researchStations = Building.installations.filter(item =>
            !item.removed && item.type === "researchStation"
        );
        Building.resources.research = (Building.resources.research || 0) +
            researchStations.length * Building.utilityDefinitions.researchStation.researchRate * seconds;

        this.resourceTimer += delta;
        if (this.resourceTimer >= 250) {
            this.resourceTimer %= 250;
            Building.updateHUD();
        }
    },

    draw() {
        const ctx = this.ctx;

        if (!this.mapInitialized) {
            const width = this.canvas.width;
            const height = this.canvas.height;
            const sky = ctx.createLinearGradient(0, 0, 0, height);
            sky.addColorStop(0, "#101d31");
            sky.addColorStop(0.62, "#23415d");
            sky.addColorStop(1, "#111d2b");
            ctx.fillStyle = sky;
            ctx.fillRect(0, 0, width, height);

            // Abstract background texture only: no terrain, fort, or map is
            // generated while the player is still in the menus.
            ctx.save();
            ctx.globalAlpha = 0.12;
            ctx.strokeStyle = "#a9c7df";
            ctx.lineWidth = 1;
            for (let y = 0; y < height; y += 42) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }
            ctx.restore();
            return;
        }

        ctx.save();

        ctx.translate(-this.cameraX * this.cameraZoom, -this.cameraOffsetY * this.cameraZoom);
        ctx.scale(this.cameraZoom, this.cameraZoom);

        this.drawBackground();
        Building.draw(ctx);
        Weapons.draw(ctx);
        if (window.DrillBot) DrillBot.draw(ctx);
        Building.drawDoorPreview(ctx);

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
            if (window.DrillBot) DrillBot.update(delta);
            if (window.DrillBot && DrillBot.bot) this.updateDrillBotCamera(DrillBot.bot);
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