
"use strict";

const Weapons = {
    cannons: [],
    projectiles: [],
    selectedTool: null,
    selectedCannon: null,
    mouse: { x: 0, y: 0 },
    mineDragging: false,
    mineMetalCost: 50,
    fireCooldown: 1.2,
    projectileSpeed: 12,
    cannonMetalCost: 100,
    cannonEnergyCost: 50,
    lastCannonClick: 0,
    lastClickedCannon: null,
    doubleClickTime: 350,

    init() {
        this.cannons = [];
        this.projectiles = [];
        this.selectedCannon = null;
        this.selectedTool = null;
        this.mineDragging = false;
        this.lastCannonClick = 0;
        this.lastClickedCannon = null;

        const cannonButton = document.getElementById("btn-cannon");

        if (cannonButton) {
            cannonButton.onclick = () => {
                this.selectedTool = this.selectedTool === "cannon" ? null : "cannon";
                this.updateToolButtons();
            };
        }

        let mineButton = document.getElementById("btn-mine");

        if (!mineButton) {
            mineButton = document.createElement("button");
            mineButton.id = "btn-mine";
            mineButton.type = "button";
            mineButton.textContent = "Mine (50)";

            const toolbar = cannonButton?.parentElement ||
                document.querySelector(".toolbar") ||
                document.body;

            toolbar.appendChild(mineButton);
        }

        mineButton.onclick = () => {
            this.selectedTool = this.selectedTool === "mine" ? null : "mine";
            this.mineDragging = false;
            this.updateToolButtons();
        };

        this.updateToolButtons();

        const startingNode = Building.nodes.find(node =>
            node.team === "player" &&
            !node.removed &&
            !node.isFoundation &&
            !node.isCore
        );

        if (startingNode) {
            this.addCannon(startingNode, "player");
        }
    },

    updateToolButtons() {
        const cannonButton = document.getElementById("btn-cannon");
        const mineButton = document.getElementById("btn-mine");

        if (cannonButton) {
            cannonButton.classList.toggle("active", this.selectedTool === "cannon");
        }

        if (mineButton) {
            mineButton.classList.toggle("active", this.selectedTool === "mine");
        }
    },

    clearSelectedTool() {
        this.selectedTool = null;
        this.mineDragging = false;
        this.updateToolButtons();
    },

    addCannon(node, team = "player", isAI = false) {
        if (!node || node.removed) return null;

        if (this.cannons.some(c => c.node === node)) {
            return null;
        }

        const cannon = {
            node,
            team,
            isAI,
            angle: team === "enemy" ? Math.PI : 0,
            cooldown: 0
        };

        this.cannons.push(cannon);
        return cannon;
    },

    handlePointerMove(x, y) {
        this.mouse.x = x;
        this.mouse.y = y;

        if (!this.selectedCannon) return;

        const cannon = this.selectedCannon;

        if (!cannon.node || cannon.node.removed) return;

        const pos = cannon.node.body.position;
        cannon.angle = Math.atan2(y - pos.y, x - pos.x);
    },

    handlePointerDown(x, y) {
        if (this.selectedTool === "mine") {
            if (Building.resources.metal < this.mineMetalCost) {
                return true;
            }

            this.mineDragging = true;
            this.mouse.x = x;
            this.mouse.y = y;

            return true;
        }

        if (this.selectedTool === "cannon") {
            // Prefer a nearby player joint that does not already hold a cannon.
            // Ignore foundations, cores, enemy joints, and occupied mounts.
            let node = Building.nodes
                .filter(candidate =>
                    !candidate.removed &&
                    candidate.team === "player" &&
                    !candidate.isFoundation &&
                    !candidate.isCore &&
                    !this.cannons.some(cannon => cannon.node === candidate)
                )
                .map(candidate => ({
                    node: candidate,
                    distance: Math.hypot(
                        candidate.body.position.x - x,
                        candidate.body.position.y - y
                    )
                }))
                .filter(entry => entry.distance <= 25)
                .sort((a, b) => a.distance - b.distance)[0]?.node || null;

            let mountCost = 0;

            // If there is no usable joint under the cursor, mount directly
            // onto the closest player beam instead.
            if (!node) {
                const beam = Building.getStrutAtPoint(x, y, 30);

                if (beam && beam.team === "player" && beam.a && beam.b) {
                    const a = beam.a.body.position;
                    const b = beam.b.body.position;
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const lengthSq = dx * dx + dy * dy;
                    const beamLength = Math.sqrt(lengthSq);

                    // Keep the new mounting joint far enough from either
                    // endpoint to avoid zero-length or duplicate support beams.
                    if (beamLength < 30) return true;

                    let t = lengthSq
                        ? ((x - a.x) * dx + (y - a.y) * dy) / lengthSq
                        : 0.5;

                    const endMargin = Math.min(0.2, 12 / beamLength);
                    t = Math.max(endMargin, Math.min(1 - endMargin, t));

                    const mountPoint = {
                        x: a.x + dx * t,
                        y: a.y + dy * t
                    };

                    mountCost = Building.settings(Building.material).cost * 2;
                    const totalMetal = this.cannonMetalCost + mountCost;

                    if (
                        Building.resources.metal < totalMetal ||
                        Building.resources.energy < this.cannonEnergyCost
                    ) return true;

                    node = Building.createNode(mountPoint.x, mountPoint.y, {
                        team: "player"
                    });

                    if (!node) return true;

                    const firstSupport = Building.createStrut(beam.a, node);
                    const secondSupport = Building.createStrut(node, beam.b);

                    if (!firstSupport || !secondSupport) {
                        Building.removeNode(node);
                        Building.updateHUD();
                        return true;
                    }
                }
            }

            if (!node || this.cannons.some(cannon => cannon.node === node)) {
                return true;
            }

            if (
                Building.resources.metal < this.cannonMetalCost + mountCost ||
                Building.resources.energy < this.cannonEnergyCost
            ) {
                if (mountCost) Building.removeNode(node);
                Building.updateHUD();
                return true;
            }

            if (this.addCannon(node, "player")) {
                Building.resources.metal -= this.cannonMetalCost + mountCost;
                Building.resources.energy -= this.cannonEnergyCost;
                Building.checkSupport();
                Building.updateHUD();
                this.clearSelectedTool();
            } else if (mountCost) {
                Building.removeNode(node);
                Building.updateHUD();
            }

            return true;
        }

        const clickedCannon = this.cannons.find(c => {
            if (c.team !== "player" || !c.node || c.node.removed) {
                return false;
            }

            const pos = c.node.body.position;
            return Math.hypot(pos.x - x, pos.y - y) < 28;
        });

        if (clickedCannon) {
            const now = performance.now();

            const isDoubleClick =
                this.lastClickedCannon === clickedCannon &&
                now - this.lastCannonClick < this.doubleClickTime;

            this.lastCannonClick = now;
            this.lastClickedCannon = clickedCannon;

            if (isDoubleClick) {
                this.selectedCannon =
                    this.selectedCannon === clickedCannon ? null : clickedCannon;

                if (this.selectedCannon) {
                    this.handlePointerMove(x, y);
                }

                this.lastCannonClick = 0;
                this.lastClickedCannon = null;
            }

            return true;
        }

        if (this.selectedCannon) {
            this.fire(this.selectedCannon);
            return true;
        }

        return false;
    },

    handlePointerUp(x, y) {
        if (!this.mineDragging) return false;

        this.mineDragging = false;

        this.mouse.x = x;
        this.mouse.y = y;

        const node = Building.getNearestNode(x, y, 25);

        if (
            !node ||
            node.removed ||
            node.isFoundation ||
            node.isCore ||
            node.team !== "player"
        ) {
            return true;
        }

        if (Building.resources.metal < this.mineMetalCost) {
            return true;
        }

        const mine = Building.addMine(node);

        if (mine) {
            Building.resources.metal -= this.mineMetalCost;
            Building.updateHUD();
            this.clearSelectedTool();
        }

        return true;
    },

    cancelMineDrag() {
        this.mineDragging = false;
    },

    fire(cannon) {
        if (
            !cannon ||
            !cannon.node ||
            cannon.node.removed ||
            cannon.cooldown > 0
        ) {
            return;
        }

        const start = cannon.node.body.position;
        const angle = cannon.angle;

        const projectile = Matter.Bodies.circle(
            start.x + Math.cos(angle) * 30,
            start.y + Math.sin(angle) * 30,
            5,
            {
                label: "cannon-projectile",
                density: 0.003,
                frictionAir: 0.002,
                restitution: 0.1,
                isSensor: true
            }
        );

        projectile.isProjectile = true;
        projectile.damage = 35;
        projectile.team = cannon.team;
        projectile.life = 5000;
        projectile.hasHit = false;

        Matter.Composite.add(Physics.world, projectile);

        Matter.Body.setVelocity(projectile, {
            x: Math.cos(angle) * this.projectileSpeed,
            y: Math.sin(angle) * this.projectileSpeed
        });

        this.projectiles.push(projectile);
        cannon.cooldown = this.fireCooldown;
    },

    update(delta = 16.667) {
        const seconds = delta / 1000;

        for (const cannon of this.cannons) {
            if (cannon.cooldown > 0) {
                cannon.cooldown = Math.max(0, cannon.cooldown - seconds);
            }
        }

        for (const projectile of [...this.projectiles]) {
            projectile.life -= delta;

            if (
                projectile.life <= 0 ||
                projectile.hasHit ||
                projectile.position.y > window.innerHeight + 200
            ) {
                Matter.Composite.remove(Physics.world, projectile);

                this.projectiles = this.projectiles.filter(
                    p => p !== projectile
                );
            }
        }

        this.cannons = this.cannons.filter(
            c => c.node && !c.node.removed
        );

        if (
            this.selectedCannon &&
            !this.cannons.includes(this.selectedCannon)
        ) {
            this.selectedCannon = null;
        }
    },

    draw(ctx) {
        for (const cannon of this.cannons) {
            if (!cannon.node || cannon.node.removed) continue;

            const pos = cannon.node.body.position;

            ctx.save();
            ctx.translate(pos.x, pos.y);
            ctx.rotate(cannon.angle);

            ctx.fillStyle = cannon.team === "enemy" ? "#672d35" : "#303944";
            ctx.beginPath();
            ctx.arc(0, 0, 11, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = cannon.team === "enemy" ? "#e16b70" : "#8796a5";
            ctx.fillRect(0, -5, 32, 10);

            ctx.fillStyle = "#394653";
            ctx.fillRect(25, -4, 8, 8);

            ctx.restore();

            if (cannon === this.selectedCannon) {
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, 22, 0, Math.PI * 2);
                ctx.strokeStyle = "#ffe66d";
                ctx.lineWidth = 2;
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(
                    pos.x + Math.cos(cannon.angle) * 30,
                    pos.y + Math.sin(cannon.angle) * 30
                );
                ctx.lineTo(this.mouse.x, this.mouse.y);

                ctx.strokeStyle = "rgba(255, 230, 109, 0.7)";
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 6]);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        for (const projectile of this.projectiles) {
            if (projectile.hasHit) continue;

            ctx.beginPath();
            ctx.arc(
                projectile.position.x,
                projectile.position.y,
                5,
                0,
                Math.PI * 2
            );

            ctx.fillStyle =
                projectile.team === "enemy" ? "#ff5555" : "#ffb347";

            ctx.fill();
        }

        // Mine drag preview.
        if (this.mineDragging) {
            const node = Building.getNearestNode(
                this.mouse.x,
                this.mouse.y,
                25
            );

            const valid = !!(
                node &&
                !node.removed &&
                !node.isFoundation &&
                !node.isCore &&
                node.team === "player" &&
                Building.resources.metal >= this.mineMetalCost &&
                (node.canHoldMine || Building.isGroundConnected(node)) &&
                !Building.mines.some(mine => mine.node === node)
            );

            ctx.save();
            ctx.translate(this.mouse.x, this.mouse.y);

            ctx.globalAlpha = 0.8;
            ctx.fillStyle = valid ? "#43d17a" : "#e05252";

            ctx.beginPath();
            ctx.arc(0, 0, 13, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = "#202b30";
            ctx.lineWidth = 3;
            ctx.stroke();

            ctx.fillStyle = "#202b30";
            ctx.fillRect(-3, -9, 6, 18);
            ctx.fillRect(-8, -3, 16, 6);

            ctx.restore();
        }
    }
};