"use strict";

var DrillBot = window.DrillBot = {
    selected: false,
    projectile: null,
    bot: null,
    keys: Object.create(null),
    fuelSeconds: 22,
    speed: 72,
    digDistance: 0,
    mobilePad: null,

    init() {
        this.createMobilePad();
        const button = document.getElementById("btn-drill-bot");
        if (button) {
            button.disabled = false;
            button.title = "Select, then tap the ground to launch a Drill Bot";
            button.querySelector("small").textContent = "Deploy • 70 Metal";
            button.onclick = () => this.toggleDeploy();
        }
        document.addEventListener("keydown", event => {
            const key = event.key.toLowerCase();
            if (["arrowup","arrowdown","arrowleft","arrowright","w","a","s","d"].includes(key) && this.bot) {
                this.keys[key] = true;
                event.preventDefault();
            }
        });
        document.addEventListener("keyup", event => { this.keys[event.key.toLowerCase()] = false; });
        window.addEventListener("blur", () => { this.keys = Object.create(null); });
    },

    createMobilePad() {
        const controls = document.getElementById("mobile-controls");
        if (!controls || this.mobilePad) return;
        const pad = document.createElement("div");
        pad.id = "drill-bot-touch-pad";
        pad.setAttribute("role", "group");
        pad.setAttribute("aria-label", "Drill Bot movement controls");
        pad.hidden = true;
        const directions = [
            ["up", "▲", "Dig up"], ["left", "◀", "Move left"],
            ["down", "▼", "Dig down"], ["right", "▶", "Move right"]
        ];
        directions.forEach(([direction, symbol, label]) => {
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.drillDirection = direction;
            button.setAttribute("aria-label", label);
            button.textContent = symbol;
            pad.appendChild(button);
        });
        const buildButton = document.createElement("button");
        buildButton.type = "button";
        buildButton.id = "drill-bot-build-button";
        buildButton.textContent = "BUILD";
        buildButton.setAttribute("aria-label", "Build foundation and release Drill Bot");
        buildButton.addEventListener("click", () => this.buildAndRelease());
        const botControlGroup = document.createElement("div");
        botControlGroup.id = "drill-bot-control-group";
        botControlGroup.setAttribute("role", "group");
        botControlGroup.setAttribute("aria-label", "Drill Bot controls");
        botControlGroup.append(buildButton, pad);
        controls.prepend(botControlGroup);
        this.mobilePad = pad;
        pad.addEventListener("pointerdown", event => {
            const button = event.target.closest("[data-drill-direction]");
            if (!button || !this.bot) return;
            event.preventDefault();
            event.stopPropagation();
            const direction = button.dataset.drillDirection;
            this.keys["arrow" + direction] = true;
            button.classList.add("active");
            try { button.setPointerCapture(event.pointerId); } catch (_) {}
        });
        const release = event => {
            const button = event.target instanceof Element ? event.target.closest("[data-drill-direction]") : null;
            if (button) {
                this.keys["arrow" + button.dataset.drillDirection] = false;
                button.classList.remove("active");
            }
            // Clear all touch directions on cancellation or focus loss to avoid stuck movement.
            if (event.type === "pointercancel") this.clearTouchDirections();
        };
        ["pointerup", "pointercancel", "lostpointercapture"].forEach(type => pad.addEventListener(type, release));
        window.addEventListener("blur", () => this.clearTouchDirections());
    },

    clearTouchDirections() {
        ["arrowup", "arrowdown", "arrowleft", "arrowright"].forEach(key => { this.keys[key] = false; });
        if (this.mobilePad) this.mobilePad.querySelectorAll("button").forEach(button => button.classList.remove("active"));
    },

    syncMobilePad() {
        if (this.mobilePad) this.mobilePad.hidden = !(this.bot && Game.state === "playing");
    },

    toggleDeploy() {
        if (!Weapons.isResearched("drillBot")) {
            Building.showPlacementMessage("Research Drill Bot first.");
            return;
        }
        if (this.bot || this.projectile) {
            Building.showPlacementMessage("Your Drill Bot is already deployed.");
            return;
        }
        this.selected = !this.selected;
        this.updateButton();
        Building.showPlacementMessage(this.selected
            ? "Tap a clear spot on the ground to launch the Drill Bot."
            : "Drill Bot deployment cancelled.");
    },

    updateButton() {
        const button = document.getElementById("btn-drill-bot");
        if (!button) return;
        button.classList.toggle("active", this.selected);
        button.setAttribute("aria-pressed", String(this.selected));
    },

    handlePointerDown(x, y) {
        if (!this.selected) return false;
        const groundY = Physics.terrainYAt(x);
        if (y < groundY - 95 || x < 35 || x > Physics.worldWidth - 35) {
            Building.showPlacementMessage("Choose a spot close to the ground.");
            return true;
        }
        if (Building.resources.metal < 70) {
            Building.showPlacementMessage("Drill Bot delivery costs 70 Metal.");
            return true;
        }
        Building.resources.metal -= 70;
        Building.updateHUD();
        const source = Building.nodes.find(node => node.team === "player" && node.isCore && !node.removed)
            || Building.nodes.find(node => node.team === "player" && !node.removed);
        const origin = source ? source.body.position : { x: Game.cameraX + 60, y: groundY - 100 };
        this.projectile = { x: origin.x, y: origin.y, sx: origin.x, sy: origin.y,
            tx: x, ty: groundY - 8, elapsed: 0, duration: Math.max(450, Math.hypot(x-origin.x, groundY-origin.y) * 3.2) };
        this.selected = false;
        this.updateButton();
        return true;
    },

    update(delta) {
        const dt = Math.min(0.04, delta / 1000);
        if (this.projectile) {
            const p = this.projectile;
            p.elapsed += delta;
            const t = Math.min(1, p.elapsed / p.duration);
            p.x = p.sx + (p.tx-p.sx)*t;
            p.y = p.sy + (p.ty-p.sy)*t - Math.sin(t*Math.PI)*Math.min(90, Math.abs(p.tx-p.sx)*0.08+35);
            if (t >= 1) {
                this.bot = { x:p.tx, y:p.ty, fuel:this.fuelSeconds, direction:"up", digDistance:0, foundationBuilt:false };
                this.projectile = null;
                this.syncMobilePad();
                Building.showPlacementMessage("Drill Bot deployed! Use the on-screen arrows or WASD to dig.");
            }
        }
        if (!this.bot) return;
        const b = this.bot;
        b.fuel -= dt;
        let dx = 0, dy = 0;
        if (this.keys.arrowleft || this.keys.a) dx--;
        if (this.keys.arrowright || this.keys.d) dx++;
        if (this.keys.arrowup || this.keys.w) dy--;
        if (this.keys.arrowdown || this.keys.s) dy++;
        if (dx || dy) {
            const length = Math.hypot(dx,dy);
            dx /= length; dy /= length;
            b.x += dx*this.speed*dt;
            b.y += dy*this.speed*dt;
            b.digDistance += this.speed*dt;
            b.x = Math.max(18,Math.min(Physics.worldWidth-18,b.x));
            // The Drill Bot can tunnel below the surface, but can never rise into open air.
            const surfaceY = Physics.terrainYAt(b.x);
            b.y = Math.max(surfaceY + 10, Math.min(Physics.groundY+150,b.y));
        }
        if (b.fuel <= 0) {
            this.bot = null;
            this.keys = Object.create(null);
            this.syncMobilePad();
            Building.showPlacementMessage("Drill Bot fuel depleted. Its foundation remains in place.");
        }
    },

    buildAndRelease() {
        if (!this.bot) return;
        const b = this.bot;
        if (!this.buildFoundation(b.x, b.y)) return;
        this.bot = null;
        this.keys = Object.create(null);
        this.syncMobilePad();
        Building.showPlacementMessage("Foundation built! Drill Bot released.");
    },

    buildFoundation(x,y) {
        const size = 60;
        const pts = [[x-size/2,y-size/2],[x+size/2,y-size/2],[x+size/2,y+size/2],[x-size/2,y+size/2]];
        const nodes = pts.map(([px,py]) => Building.createNode(px,py,{team:"player",material:"steel",isFoundation:true}));
        if (nodes.some(node => !node)) {
            nodes.filter(Boolean).forEach(node => Building.removeNode(node,false));
            Building.showPlacementMessage("The Drill Bot couldn't secure a foundation here. Move to a clear spot and try again.");
            return false;
        }
        for (let i=0;i<4;i++) Building.createStrut(nodes[i],nodes[(i+1)%4],{material:"steel"});
        return true;
    },

    draw(ctx) {
        if (this.projectile) {
            const p=this.projectile;
            ctx.save(); ctx.strokeStyle="#70e7ff"; ctx.lineWidth=3; ctx.shadowColor="#43dfff"; ctx.shadowBlur=14;
            ctx.beginPath(); ctx.moveTo(p.x-7,p.y); ctx.lineTo(p.x+7,p.y); ctx.moveTo(p.x,p.y-7); ctx.lineTo(p.x,p.y+7); ctx.stroke();
            ctx.restore();
        }
        if (!this.bot) { this.syncMobilePad(); return; }
        const b=this.bot;
        ctx.save(); ctx.translate(b.x,b.y);
        ctx.fillStyle="#263d4b"; ctx.strokeStyle="#76e6ff"; ctx.lineWidth=2;
        ctx.shadowColor="#42dfff"; ctx.shadowBlur=10;
        ctx.beginPath(); ctx.roundRect(-15,-10,30,20,5); ctx.fill(); ctx.stroke();
        ctx.shadowBlur=0; ctx.fillStyle="#f5c85b"; ctx.fillRect(-7,-5,14,5);
        ctx.fillStyle="#9fb4c2"; ctx.fillRect(-19,9,38,5);
        ctx.fillStyle="#ffffff"; ctx.font="bold 10px Arial"; ctx.textAlign="center"; ctx.fillText("DRILL",0,-17);
        ctx.fillStyle="#17212b"; ctx.fillRect(-19,19,38,4);
        ctx.fillStyle="#64e58b"; ctx.fillRect(-19,19,38*Math.max(0,b.fuel/this.fuelSeconds),4);
        ctx.restore();
    }
};
