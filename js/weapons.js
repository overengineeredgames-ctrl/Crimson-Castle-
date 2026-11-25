
"use strict";

const Weapons = {
    cannons: [],
    projectiles: [],
    selectedTool: null,
    selectedCannon: null,
    links: [], linkMode: false, linkSource: null,
    selectedCannons: [],
    mouse: { x: 0, y: 0 },
    mineDragging: false,
    mineMetalCost: 50,
    fireCooldown: 1.2,
    projectileSpeed: 12,
    cannonMetalCost: 100,
    cannonEnergyCost: 50,
    selectedWeaponType: "cannon",
    fireHeld: false,
    weaponStats: {
        cannon: { name: "Cannon", damage: 35, cooldown: 1.2, speed: 12, radius: 5, metal: 100, energy: 50 },
        machineGun: { name: "Machine Gun", damage: 7, cooldown: 0.12, speed: 14, radius: 3, metal: 140, energy: 70 },
        megaCannon: { name: "Mega Cannon", damage: 220, cooldown: 15, speed: 10, radius: 9, metal: 260, energy: 130 }
    },
    lastCannonClick: 0,
    lastClickedCannon: null,
    doubleClickTime: 350,

    init() {
        this.cannons = [];
        this.projectiles = [];
        this.selectedCannon = null;
        this.selectedCannons = [];
        this.selectedTool = null;
        this.links = []; this.linkMode = false; this.linkSource = null;
        this.selectedWeaponType = "cannon";
        this.fireHeld = false;
        this.mineDragging = false;
        this.lastCannonClick = 0;
        this.lastClickedCannon = null;

        const cannonButton = document.getElementById("btn-cannon");

        if (cannonButton) {
            cannonButton.onclick = () => {
                const alreadySelected = this.selectedTool === "cannon" &&
                    this.selectedWeaponType === "cannon";
                if (typeof Building !== "undefined") {
                    Building.utilityTool = null;
                    Building.repairMode = false;
                    Building.updateToolbar();
                }
                if (typeof Building !== "undefined" && Building.deleteMode) {
                    Building.setDeleteMode(false);
                }
                this.clearSelectedCannon();
                this.clearSelectedTool();
                this.selectedWeaponType = "cannon";
                this.selectedTool = alreadySelected ? null : "cannon";
                this.updateToolButtons();
            };
        }

        this.createWeaponButton("machine-gun", "Machine Gun", "machineGun", "140 Metal / 70 Energy");
        this.createWeaponButton("mega-cannon", "Mega Cannon", "megaCannon", "260 Metal / 130 Energy");

        let mineButton = document.getElementById("btn-mine");

        if (!mineButton) {
            mineButton = document.createElement("button");
            mineButton.id = "btn-mine";
            mineButton.type = "button";
            mineButton.className = "tool";
            mineButton.dataset.toolCategory = "utilities";
            mineButton.innerHTML = 'Mine<small>50 Metal</small>';

            const toolbar = document.querySelector(".toolbar") ||
                cannonButton?.parentElement || document.body;

            toolbar.appendChild(mineButton);
        } else {
            mineButton.classList.add("tool");
            mineButton.dataset.toolCategory = "utilities";
        }

        mineButton.onclick = () => {
            const alreadySelected = this.selectedTool === "mine";
            if (typeof Building !== "undefined") {
                Building.utilityTool = null;
                Building.repairMode = false;
                Building.updateToolbar();
            }
            if (typeof Building !== "undefined" && Building.deleteMode) {
                Building.setDeleteMode(false);
            }
            this.clearSelectedCannon();
            this.clearSelectedTool();
            this.selectedTool = alreadySelected ? null : "mine";
            this.mineDragging = false;
            this.updateToolButtons();
        };

        const linkButton = document.getElementById("btn-link");
        if (linkButton) linkButton.onclick = () => {
            const enable = !this.linkMode;
            Building.utilityTool = null; Building.repairMode = false; Building.setDeleteMode(false); Building.updateToolbar();
            this.clearSelectedTool(); this.setLinkMode(enable);
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

    createWeaponButton(id, label, weaponType, costLabel) {
        let button = document.getElementById("btn-" + id);
        if (!button) {
            button = document.createElement("button");
            button.id = "btn-" + id;
            button.type = "button";
            button.className = "tool";
            button.dataset.toolCategory = "weapons";
            button.innerHTML = label + "<small>" + costLabel + "</small>";
            button.title = weaponType === "machineGun"
                ? "7 damage per shot • 0.12 second reload • hold to fire"
                : "220 damage • 15 second reload • visible cooldown";
            const cannonButton = document.getElementById("btn-cannon");
            const previousButton = weaponType === "megaCannon"
                ? document.getElementById("btn-machine-gun") || cannonButton
                : cannonButton;
            if (previousButton && previousButton.parentElement) {
                previousButton.insertAdjacentElement("afterend", button);
            } else {
                (document.querySelector(".toolbar") || document.body).appendChild(button);
            }
        }
        button.onclick = () => {
            const alreadySelected = this.selectedTool === "cannon" &&
                this.selectedWeaponType === weaponType;
            if (typeof Building !== "undefined") {
                Building.utilityTool = null;
                Building.repairMode = false;
                Building.updateToolbar();
            }
            if (typeof Building !== "undefined" && Building.deleteMode) {
                Building.setDeleteMode(false);
            }
            this.clearSelectedCannon();
            this.clearSelectedTool();
            this.selectedWeaponType = weaponType;
            this.selectedTool = alreadySelected ? null : "cannon";
            this.updateToolButtons();
        };
    },

    updateToolButtons() {
        const buttons = [
            ["btn-cannon", "cannon"],
            ["btn-machine-gun", "machineGun"],
            ["btn-mega-cannon", "megaCannon"]
        ];
        for (const [id, type] of buttons) {
            const button = document.getElementById(id);
            if (button) button.classList.toggle(
                "active",
                this.selectedTool === "cannon" && this.selectedWeaponType === type
            );
        }
        const mineButton = document.getElementById("btn-mine");
        if (mineButton) mineButton.classList.toggle("active", this.selectedTool === "mine");
        const linkButton = document.getElementById("btn-link");
        if (linkButton) { linkButton.classList.toggle("active", this.linkMode); linkButton.setAttribute("aria-pressed", String(this.linkMode)); }
    },

    clearSelectedTool() {
        this.selectedTool = null; this.linkMode = false; this.linkSource = null; this.mineDragging = false;
        this.syncLinkedDoors(); this.updateToolButtons();
    },
    getLinkedDoors(weapon) { return this.links.filter(link => link.weapon === weapon && link.door && Building.struts.includes(link.door) && link.door.isDoor).map(link => link.door); },
    linkDoorToWeapon(weapon, door) {
        if (!weapon || !door || !door.isDoor || !Building.struts.includes(door)) return false;
        const i = this.links.findIndex(link => link.weapon === weapon && link.door === door);
        if (i >= 0) { this.links.splice(i, 1); return false; }
        this.links.push({ weapon, door }); return true;
    },
    removeLinksForDoor(door) { this.links = this.links.filter(link => link.door !== door); },
    removeLinksForWeapon(weapon) { for (const door of this.getLinkedDoors(weapon)) Building.setDoorOpen(door, false); this.links = this.links.filter(link => link.weapon !== weapon); if (this.linkSource === weapon) this.linkSource = null; },
    syncLinkedDoors() {
        if (typeof Building === "undefined") return;
        const selected = this.selectedCannons.length ? this.selectedCannons : (this.selectedCannon ? [this.selectedCannon] : []);
        const active = new Set();
        for (const weapon of selected) if (weapon.team === "player") for (const door of this.getLinkedDoors(weapon)) active.add(door);
        for (const door of Building.struts) if (door.isDoor && door.team === "player") Building.setDoorOpen(door, active.has(door));
    },
    setLinkMode(enabled) { this.linkMode = !!enabled; this.linkSource = null; this.selectedTool = this.linkMode ? "link" : null; this.clearSelectedCannon(); this.updateToolButtons(); },
    handleLinkPointerDown(x, y) {
        if (!this.linkMode) return false;

        // Use a generous world-space hit area so doors remain tappable at
        // the smaller camera zoom used on phones.
        const weapon = [...this.cannons].reverse().find(c => {
            if (c.team !== "player" || !c.node || c.node.removed) return false;
            const p = c.node.body.position;
            const dx = x - p.x, dy = y - p.y;
            const angle = c.angle || 0;
            const localX = dx * Math.cos(angle) + dy * Math.sin(angle);
            const localY = -dx * Math.sin(angle) + dy * Math.cos(angle);
            const type = c.weaponType || "cannon";
            const barrelLength = type === "megaCannon" ? 43 : type === "machineGun" ? 27 : 32;
            const barrelHeight = type === "megaCannon" ? 14 : type === "machineGun" ? 7 : 10;
            return Math.hypot(dx, dy) <= 32 ||
                (localX >= -10 && localX <= barrelLength + 16 && Math.abs(localY) <= barrelHeight / 2 + 18);
        });
        if (weapon) {
            this.linkSource = weapon;
            Building.showPlacementMessage("Weapon selected — tap a door to link it.");
            return true;
        }

        // The rendered leaf swings around endpoint A. Hit-test that same
        // rotated segment, not just the closed-door anchor positions.
        const door = [...Building.struts].reverse().find(d => {
            if (!d.isDoor || d.team !== "player" || !d.a || !d.b ||
                d.a.removed || d.b.removed) return false;
            const a = d.a.body.position, b = d.b.body.position;
            const baseAngle = Math.atan2(b.y - a.y, b.x - a.x);
            const length = Math.hypot(b.x - a.x, b.y - a.y);
            const swing = (d.doorOpenAmount || 0) * (d.team === "enemy" ? -Math.PI / 2 : Math.PI / 2);
            const angle = baseAngle + swing;
            const end = { x: a.x + Math.cos(angle) * length, y: a.y + Math.sin(angle) * length };
            const closedDistance = Building.pointToSegmentDistance(x, y, a, b);
            const openDistance = Building.pointToSegmentDistance(x, y, a, end);
            return Math.min(closedDistance, openDistance) <= 48;
        });
        if (door && this.linkSource) {
            const added = this.linkDoorToWeapon(this.linkSource, door);
            Building.showPlacementMessage(added ? "Door linked." : "Door unlinked.");
            return true;
        }
        if (door) Building.showPlacementMessage("Select a weapon first.");
        else Building.showPlacementMessage(this.linkSource ? "Tap directly on a door to link it." : "Select a weapon first.");
        return !!door;
    },

    clearSelectedCannon() {
        this.selectedCannon = null;
        this.selectedCannons = [];
        this.fireHeld = false;
        this.syncLinkedDoors();
        this.lastCannonClick = 0;
        this.lastClickedCannon = null;
    },

    addCannon(node, team = "player", isAI = false, weaponType = "cannon") {
        if (!node || node.removed) return null;
        if (this.cannons.some(c => c.node === node)) return null;
        const stats = this.weaponStats[weaponType] || this.weaponStats.cannon;
        const cannon = {
            node,
            team,
            isAI,
            weaponType: this.weaponStats[weaponType] ? weaponType : "cannon",
            angle: team === "enemy" ? Math.PI : 0,
            cooldown: 0,
            cooldownMax: stats.cooldown
        };

        this.cannons.push(cannon);
        return cannon;
    },

    handlePointerMove(x, y) {
        this.mouse.x = x;
        this.mouse.y = y;

        const selected = this.selectedCannons.length
            ? this.selectedCannons
            : (this.selectedCannon ? [this.selectedCannon] : []);

        for (const cannon of selected) {
            if (!cannon.node || cannon.node.removed) continue;
            const pos = cannon.node.body.position;
            cannon.angle = Math.atan2(y - pos.y, x - pos.x);
        }
    },

    handlePointerDown(x, y, ctrlKey = false) {
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
                    (!candidate.isFoundation || candidate.isGroundJoint) &&
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
                .filter(entry => entry.distance <= 42)
                .sort((a, b) => a.distance - b.distance)[0]?.node || null;

            const selectedStats = this.weaponStats[this.selectedWeaponType] || this.weaponStats.cannon;
            const weaponMetalCost = selectedStats.metal;
            const weaponEnergyCost = selectedStats.energy;
            let mountCost = 0;

            // If there is no usable joint under the cursor, mount directly
            // onto the closest player beam instead.
            if (!node) {
                const beam = Building.getStrutAtPoint(x, y, 42);

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
                    const totalMetal = weaponMetalCost + mountCost;

                    if (
                        Building.resources.metal < totalMetal ||
                        Building.resources.energy < weaponEnergyCost
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
                Building.resources.metal < weaponMetalCost + mountCost ||
                Building.resources.energy < weaponEnergyCost
            ) {
                if (mountCost) Building.removeNode(node);
                Building.updateHUD();
                return true;
            }

            if (this.addCannon(node, "player", false, this.selectedWeaponType)) {
                Building.resources.metal -= weaponMetalCost + mountCost;
                Building.resources.energy -= weaponEnergyCost;
                Building.checkSupport();
                Building.updateHUD();
                this.clearSelectedTool();
            } else if (mountCost) {
                Building.removeNode(node);
                Building.updateHUD();
            }

            return true;
        }

        const clickedCannon = [...this.cannons].reverse().find(c => {
            if (c.team !== "player" || !c.node || c.node.removed) {
                return false;
            }

            // Match the cannon's rendered body and barrel. The barrel is
            // rotated with the cannon, so test the pointer in local space.
            const pos = c.node.body.position;
            const dx = x - pos.x;
            const dy = y - pos.y;
            const type = c.weaponType || "cannon";
            const bodyRadius = type === "megaCannon" ? 14 : 11;
            if (Math.hypot(dx, dy) <= bodyRadius + 2) return true;

            const angle = c.angle || 0;
            const localX = dx * Math.cos(angle) + dy * Math.sin(angle);
            const localY = -dx * Math.sin(angle) + dy * Math.cos(angle);
            const barrelLength = type === "megaCannon" ? 43 : type === "machineGun" ? 27 : 32;
            const barrelHeight = type === "megaCannon" ? 14 : type === "machineGun" ? 7 : 10;
            return localX >= -2 && localX <= barrelLength + 4 &&
                Math.abs(localY) <= barrelHeight / 2 + 2;
        });

        if (clickedCannon) {
            const selectedIndex = this.selectedCannons.indexOf(clickedCannon);

            if (ctrlKey) {
                // Ctrl-click toggles this cannon in or out of the group.
                if (selectedIndex >= 0) {
                    this.selectedCannons.splice(selectedIndex, 1);
                } else if (this.selectedCannons.length < 3) {
                    this.selectedCannons.push(clickedCannon);
                }
            } else if (
                selectedIndex >= 0 &&
                this.selectedCannons.length === 1
            ) {
                // Clicking the only selected cannon again deselects it.
                this.selectedCannons = [];
            } else {
                // A normal click selects just this cannon, replacing any group.
                this.selectedCannons = [clickedCannon];
            }

            this.selectedCannon = this.selectedCannons[0] || null;
            this.syncLinkedDoors();
            this.handlePointerMove(x, y);
            this.lastCannonClick = 0;
            this.lastClickedCannon = null;
            return true;
        }

        const selected = this.selectedCannons.length
            ? this.selectedCannons
            : (this.selectedCannon ? [this.selectedCannon] : []);

        if (selected.length) {
            this.handlePointerMove(x, y);
            this.fireHeld = selected.some(cannon => cannon.weaponType === "machineGun");
            for (const cannon of selected) this.fire(cannon);
            return true;
        }

        return false;
    },

    handlePointerUp(x, y) {
        this.fireHeld = false;
        if (!this.mineDragging) return false;

        this.mineDragging = false;

        this.mouse.x = x;
        this.mouse.y = y;

        const node = Building.getNearestNode(x, y, (Building.nodeRadius || 6) + 7);

        if (
            !node ||
            node.removed ||
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
        this.fireHeld = false;
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

        const stats = this.weaponStats[cannon.weaponType] || this.weaponStats.cannon;
        const projectile = Matter.Bodies.circle(
            start.x + Math.cos(angle) * 34,
            start.y + Math.sin(angle) * 34,
            stats.radius,
            {
                label: "cannon-projectile",
                density: 0.003,
                frictionAir: 0.002,
                restitution: 0.1,
                isSensor: true
            }
        );

        projectile.isProjectile = true;
        projectile.damage = stats.damage;
        projectile.team = cannon.team;
        projectile.life = 20000;
        projectile.displayRadius = stats.radius;
        projectile.hasHit = false;

        Matter.Composite.add(Physics.world, projectile);

        Matter.Body.setVelocity(projectile, {
            x: Math.cos(angle) * stats.speed,
            y: Math.sin(angle) * stats.speed
        });

        this.projectiles.push(projectile);
        cannon.cooldownMax = stats.cooldown;
        cannon.cooldown = stats.cooldown;
    },

    update(delta = 16.667) {
        const seconds = delta / 1000;

        for (const cannon of this.cannons) {
            if (cannon.cooldown > 0) {
                cannon.cooldown = Math.max(0, cannon.cooldown - seconds);
            }
        }

        if (this.fireHeld) {
            const selected = this.selectedCannons.length
                ? this.selectedCannons
                : (this.selectedCannon ? [this.selectedCannon] : []);
            for (const cannon of selected) {
                if (cannon.weaponType === "machineGun") this.fire(cannon);
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

        const livingCannons = this.cannons.filter(c => c.node && !c.node.removed);
        for (const cannon of this.cannons) if (!livingCannons.includes(cannon)) this.removeLinksForWeapon(cannon);
        this.cannons = livingCannons;
        this.links = this.links.filter(link => this.cannons.includes(link.weapon) && Building.struts.includes(link.door) && !link.door.a.removed && !link.door.b.removed);

        this.selectedCannons = this.selectedCannons.filter(cannon =>
            this.cannons.includes(cannon) &&
            cannon.team === "player" &&
            !cannon.detached
        ).slice(0, 3);
        this.selectedCannon = this.selectedCannons[0] || null;
    },

    draw(ctx) {
        if (this.linkMode) {
            ctx.save(); ctx.setLineDash([7, 6]); ctx.lineWidth = 2; ctx.strokeStyle = "rgba(104,220,255,.72)";
            for (const link of this.links) { if (!this.cannons.includes(link.weapon) || !Building.struts.includes(link.door)) continue; const p = link.weapon.node.body.position, d = link.door; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo((d.a.body.position.x + d.b.body.position.x) / 2, (d.a.body.position.y + d.b.body.position.y) / 2); ctx.stroke(); }
            ctx.setLineDash([]);
            if (this.linkSource && this.linkSource.node && !this.linkSource.node.removed) { const p = this.linkSource.node.body.position; ctx.beginPath(); ctx.arc(p.x, p.y, 27, 0, Math.PI * 2); ctx.strokeStyle = "#ffe66d"; ctx.lineWidth = 3; ctx.stroke(); }
            ctx.restore();
        }
        for (const cannon of this.cannons) {
            if (!cannon.node || cannon.node.removed) continue;

            const pos = cannon.node.body.position;

            ctx.save();
            if (cannon.node.debrisGroup) {
                ctx.globalAlpha *= cannon.node.debrisGroup.alpha;
            }
            ctx.translate(pos.x, pos.y);
            ctx.rotate(cannon.angle);

            const type = cannon.weaponType || "cannon";
            ctx.fillStyle = cannon.team === "enemy" ? "#672d35" : "#303944";
            ctx.beginPath();
            ctx.arc(0, 0, type === "megaCannon" ? 14 : 11, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = type === "machineGun"
                ? "#e2bd55"
                : type === "megaCannon"
                    ? "#b85bdf"
                    : (cannon.team === "enemy" ? "#e16b70" : "#8796a5");
            const barrelLength = type === "megaCannon" ? 43 : type === "machineGun" ? 27 : 32;
            const barrelHeight = type === "megaCannon" ? 14 : type === "machineGun" ? 7 : 10;
            ctx.fillRect(0, -barrelHeight / 2, barrelLength, barrelHeight);
            ctx.fillStyle = "#394653";
            ctx.fillRect(barrelLength - 5, -barrelHeight / 2 - 1, 8, barrelHeight + 2);

            ctx.restore();

            if (cannon.cooldown > 0) {
                const stats = this.weaponStats[cannon.weaponType] || this.weaponStats.cannon;
                const progress = Math.max(0, Math.min(1, cannon.cooldown / (cannon.cooldownMax || stats.cooldown)));
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, 19, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
                ctx.strokeStyle = cannon.weaponType === "megaCannon" ? "#d98aff" : "#ffd166";
                ctx.lineWidth = 3;
                ctx.stroke();
                if (cannon.weaponType === "megaCannon") {
                    ctx.font = "bold 12px Arial";
                    ctx.textAlign = "center";
                    ctx.fillStyle = "#ffffff";
                    ctx.strokeStyle = "rgba(10,12,20,.9)";
                    ctx.lineWidth = 3;
                    ctx.strokeText(cannon.cooldown.toFixed(1) + "s", pos.x, pos.y - 25);
                    ctx.fillText(cannon.cooldown.toFixed(1) + "s", pos.x, pos.y - 25);
                }
            }

            if (this.selectedCannons.includes(cannon) ||
                (this.selectedCannons.length === 0 && cannon === this.selectedCannon)) {
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
                projectile.displayRadius || 5,
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
                (Building.nodeRadius || 6) + 7
            );

            const valid = !!(
                node &&
                !node.removed &&
                !node.isCore &&
                node.team === "player" &&
                Building.resources.metal >= this.mineMetalCost &&
                node.canHoldMine &&
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