
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
        this.resizeCanvas();

        Physics.init();
        Building.init();
        Weapons.init();
        AI.init();

        this.createMenus();
        this.setupInput();

        this.state = "menu";
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

            .forts-pause-label {
                color:#f0c45b;
                font-size:12px;
                letter-spacing:3px;
                font-weight:bold;
            }
        `;

        document.head.appendChild(style);

        this.startScreen = this.createOverlay("forts-start-screen", `
            <div class="forts-menu-card">
                <div class="forts-pause-label">REAL-TIME FORTRESS WARFARE</div>
                <h1 class="forts-menu-title">FORTS</h1>
                <p class="forts-menu-subtitle">
                    Build your fortress. Protect your core. Destroy the enemy.
                </p>

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
            .addEventListener("click", () => window.location.reload());

        this.pauseScreen.querySelector("#forts-main-menu-button")
            .addEventListener("click", () => this.showMainMenu());

        this.endScreen.querySelector("#forts-end-restart")
            .addEventListener("click", () => window.location.reload());

        this.endScreen.querySelector("#forts-end-menu")
            .addEventListener("click", () => this.showMainMenu());

        AI.setDifficulty(this.difficulty);
        this.showOnly(this.startScreen);
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
            this.endScreen
        ]) {
            if (item) item.style.display = "none";
        }

        if (screen) screen.style.display = "flex";
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

            if (event.button === 2) {
                Building.deleteAt(p.x, p.y);
                return;
            }

            if (event.button !== 0) return;

            this.canvas.setPointerCapture(event.pointerId);

            if (Weapons.handlePointerDown(p.x, p.y)) return;

            Building.startDrag(p.x, p.y);
        });

        this.canvas.addEventListener("pointermove", event => {
            const p = this.mousePosition(event);

            if (this.state !== "playing") return;

            Building.setMousePosition(p.x, p.y);
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

        sky.addColorStop(0, "#72b5e5");
        sky.addColorStop(1, "#d8e9f4");

        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = "#94b77b";
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

        ctx.fillStyle = "#64834c";
        ctx.fillRect(0, groundY, w, h - groundY);

        ctx.fillStyle = "#896a48";
        ctx.fillRect(0, groundY + 12, w, h - groundY - 12);

        ctx.fillStyle = "#405c35";
        ctx.fillRect(0, groundY, w, 5);
    },

    drawHints() {
        const ctx = this.ctx;

        ctx.save();

        ctx.font = "13px Arial";
        ctx.fillStyle = "rgba(255,255,255,0.95)";
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
            "Right-click: delete | G: grid | 1: wood | 2: steel | ESC: pause",
            14,
            this.canvas.height - 38
        );

        ctx.fillText(
            "Double-click cannon to select; move mouse to aim, click to fire",
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