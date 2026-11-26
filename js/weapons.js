
"use strict";

var Weapons = window.Weapons = {
    cannons: [],
    projectiles: [],
    flakExplosions: [],
    selectedTool: null,
    selectedCannon: null,
    links: [], linkMode: false, linkSource: null, linkHoverDoor: null, linkDoorTargets: [],
    selectedCannons: [],
    groupSelectMode: false,
    mouse: { x: 0, y: 0 },
    mineDragging: false,
    mineMetalCost: 50,
    fireCooldown: 1.2,
    projectileSpeed: 12,
    cannonMetalCost: 100,
    cannonEnergyCost: 50,
    selectedWeaponType: "cannon",
    fireHeld: false,
    sniperAimDrag: null,
    pendingSniperFire: null,
    sniperFireReadyToShow: false,
    sniperFireTimer: null,
    sniperFireButton: null,
    researchProjects: {
        flakCannon: { metalCost: 40, duration: 10, progress: 0, researching: false, unlocked: false }
    },
    researchRefreshTimer: 0,
    weaponStats: {
        cannon: { name: "Cannon", damage: 35, cooldown: 1.2, speed: 12, radius: 5, metal: 100, energy: 50 },
        machineGun: { name: "Machine Gun", damage: 7, cooldown: 0.12, speed: 14, radius: 3, metal: 140, energy: 70 },
        megaCannon: { name: "Mega Cannon", damage: 220, cooldown: 15, speed: 10, radius: 9, metal: 260, energy: 130 },
        flakCannon: { name: "Flak Cannon", damage: 0, cooldown: 2.1, speed: 11, radius: 7, metal: 190, energy: 95, blastRadius: 76, fuse: 1050, volleyCount: 5, spread: 0.48, burstInterval: 65 },
        sniper: { name: "Sniper", damage: 95, cooldown: 5.5, speed: 19, radius: 4, metal: 230, energy: 115 }
    },
    lastCannonClick: 0,
    lastClickedCannon: null,
    doubleClickTime: 350,

    init() {
        this.cannons = [];
        this.researchProjects = {
            flakCannon: { metalCost: 40, duration: 10, progress: 0, researching: false, unlocked: false }
        };
        this.researchRefreshTimer = 0;
        this.projectiles = [];
        this.flakExplosions = [];
        this.selectedCannon = null;
        this.selectedCannons = [];
        this.groupSelectMode = false;
        this.selectedTool = null;
        this.links = []; this.linkMode = false; this.linkSource = null; this.linkHoverDoor = null; this.linkDoorTargets = [];
        this.selectedWeaponType = "cannon";
        this.fireHeld = false;
        this.sniperAimDrag = null;
        this.pendingSniperFire = null;
        if (this.sniperFireTimer) clearTimeout(this.sniperFireTimer);
        this.sniperFireTimer = null;
        this.ensureSniperFireButton();
        this.hideSniperFireButton();
        this.mineDragging = false;
        this.lastCannonClick = 0;
        this.lastClickedCannon = null;

        const cannonButton = document.getElementById("btn-cannon");

        if (cannonButton) {
            cannonButton.onclick = () => {
                const alreadySelected = this.selectedTool === "cannon" &&
                    this.selectedWeaponType === "cannon";
                if (typeof Building !== "undefined") {
                    // Switching to a weapon must exit door placement mode too.
                    Building.doorMaterial = null;
                    Building.doorModifierDrag = null;
                    if (Building.hideDoorConfirm) Building.hideDoorConfirm();
                    Building.utilityTool = null;
                    Building.repairMode = false;
                    Building.repairTarget = null;
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
        this.createWeaponButton("sniper", "Sniper", "sniper", "230 Metal / 115 Energy");
        this.createWeaponButton("flak-cannon", "Flak Cannon", "flakCannon", "190 Metal / 95 Energy");
        this.ensureFlakSettingsUI();

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
                // Weapon and mine tools take priority over door construction.
                Building.doorMaterial = null;
                Building.doorModifierDrag = null;
                if (Building.hideDoorConfirm) Building.hideDoorConfirm();
                Building.utilityTool = null;
                Building.repairMode = false;
                Building.repairTarget = null;
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
            this.setLinkMode(!this.linkMode);
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

    ensureSniperFireButton() {
        let button = document.getElementById("sniper-fire-confirm");
        if (!button) {
            button = document.createElement("button");
            button.id = "sniper-fire-confirm";
            button.type = "button";
            button.textContent = "FIRE";
            button.setAttribute("aria-label", "Fire Sniper");
            button.style.cssText = [
                "position:fixed",
                "right:18px",
                "bottom:22px",
                "z-index:12000",
                "width:58px",
                "height:58px",
                "padding:0",
                "border:2px solid #a8eaff",
                "border-radius:50%",
                "background:linear-gradient(145deg,#168fc4,#07517e)",
                "color:#fff",
                "font:bold 12px Arial,sans-serif",
                "letter-spacing:.3px",
                "box-shadow:0 2px 12px rgba(0,0,0,.5),0 0 12px rgba(64,200,255,.45)",
                "display:none",
                "align-items:center",
                "justify-content:center",
                "touch-action:manipulation"
            ].join(";");
            document.body.appendChild(button);
        }
        button.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            const selected = this.selectedCannons.length
                ? this.selectedCannons
                : (this.selectedCannon ? [this.selectedCannon] : []);
            const cannon = selected.length === 1 && selected[0].weaponType === "sniper"
                ? selected[0]
                : null;
            if (!cannon || cannon.cooldown > 0 || !cannon.node || cannon.node.removed) return;
            this.fire(cannon);
            this.updateSniperFireButton();
        };
        this.sniperFireButton = button;
    },

    hideSniperFireButton() {
        if (this.sniperFireTimer) clearTimeout(this.sniperFireTimer);
        this.sniperFireTimer = null;
        this.pendingSniperFire = null;
        this.sniperFireReadyToShow = false;
        if (this.sniperFireButton) this.sniperFireButton.style.display = "none";
    },

    updateSniperFireButton() {
        if (!this.sniperFireButton) this.ensureSniperFireButton();
        const button = this.sniperFireButton;
        const selected = this.selectedCannons.length
            ? this.selectedCannons
            : (this.selectedCannon ? [this.selectedCannon] : []);
        const cannon = selected.length === 1 ? selected[0] : null;

        // Show the Fire control for as long as exactly one player Sniper is
        // selected. Aiming and releasing no longer control the button's life.
        if (!cannon || cannon.weaponType !== "sniper" ||
            cannon.team !== "player" || !cannon.node || cannon.node.removed) {
            button.style.display = "none";
            button.disabled = false;
            return;
        }

        const remaining = Math.max(0, cannon.cooldown || 0);
        button.disabled = remaining > 0;
        button.textContent = remaining > 0 ? remaining.toFixed(1) + "s" : "FIRE";
        button.style.opacity = remaining > 0 ? "0.7" : "1";
        button.style.display = "flex";
    },

    ensureFlakSettingsUI() {
        let button = document.getElementById("btn-flak-settings");
        if (!button) {
            button = document.createElement("button");
            button.id = "btn-flak-settings";
            button.type = "button";
            button.className = "tool";
            button.dataset.toolCategory = "tools";
            button.textContent = "Flak Settings";
            button.hidden = true;
            button.title = "Configure the selected Flak Cannon";
            const flakButton = document.getElementById("btn-flak-cannon");
            if (flakButton && flakButton.parentElement) flakButton.insertAdjacentElement("afterend", button);
            else (document.querySelector(".toolbar") || document.body).appendChild(button);
        }
        // Keep the control hidden until the Tools tab is explicitly selected.
        button.hidden = true;
        button.style.display = "none";
        button.classList.add("tool");
        button.dataset.toolCategory = "tools";
        button.onclick = () => {
            if (!this.getSettingsFlakCannon()) return;
            const panel = document.getElementById("flak-settings-panel");
            if (panel) panel.dataset.open = panel.dataset.open === "true" ? "false" : "true";
            this.refreshFlakSettingsUI();
        };

        let panel = document.getElementById("flak-settings-panel");
        if (!panel) {
            panel = document.createElement("section");
            panel.id = "flak-settings-panel";
            panel.hidden = true;
            panel.dataset.open = "false";
            panel.setAttribute("aria-label", "Flak Cannon settings");
            panel.style.cssText = "position:fixed;z-index:13000;right:12px;bottom:16px;width:min(340px,calc(100vw - 24px));max-height:75vh;overflow:auto;padding:14px;border:1px solid #e58b3d;border-radius:10px;background:rgba(12,22,34,.98);color:#f4f7fb;box-shadow:0 8px 28px rgba(0,0,0,.55);font:13px Arial,sans-serif;box-sizing:border-box";
            if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) panel.style.bottom = "58px";
            panel.innerHTML =
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px"><strong style="flex:1;font-size:15px">FLAK CANNON SETTINGS</strong><button id="flak-settings-close" type="button" aria-label="Close settings">×</button></div>' +
                '<div style="font-weight:700;margin:8px 0">Control mode</div>' +
                '<div style="display:flex;gap:8px"><button id="flak-mode-auto" type="button" style="flex:1">AUTO CANNON</button><button id="flak-mode-manual" type="button" style="flex:1">MANUAL</button></div>' +
                '<div style="font-weight:700;margin:16px 0 4px">Bullet types to target</div>' +
                '<div id="flak-target-types"></div>' +
                '<div style="color:#aebdca;font-size:11px;margin-top:10px">Priority is used to choose between detected bullet types. Higher percentages are preferred.</div>';
            // The floating panel belongs to the document, not the flex toolbar.
            document.body.appendChild(panel);
            panel.querySelector("#flak-settings-close").onclick = () => {
                panel.dataset.open = "false";
                this.refreshFlakSettingsUI();
            };
            panel.querySelector("#flak-mode-auto").onclick = () => {
                const cannon = this.getSettingsFlakCannon();
                if (!cannon) return;
                cannon.autoDefense = true;
                this.refreshFlakSettingsUI();
            };
            panel.querySelector("#flak-mode-manual").onclick = () => {
                const cannon = this.getSettingsFlakCannon();
                if (!cannon) return;
                cannon.autoDefense = false;
                this.refreshFlakSettingsUI();
            };
            const types = [
                ["cannon", "Cannon"],
                ["machineGun", "Machine Gun"],
                ["megaCannon", "Mega Cannon"],
                ["sniper", "Sniper"]
            ];
            const container = panel.querySelector("#flak-target-types");
            for (const [type, label] of types) {
                const row = document.createElement("div");
                row.style.cssText = "padding:9px 0;border-top:1px solid rgba(255,255,255,.12)";
                row.innerHTML = '<label style="display:flex;align-items:center;gap:8px;font-weight:700"><input type="checkbox" data-flak-type="' + type + '" style="accent-color:#e58b3d">' + label + '</label>' +
                    '<label style="display:block;margin:7px 0 0">Priority: <strong data-priority-value="' + type + '">50%</strong></label>' +
                    '<input type="range" min="0" max="100" step="1" value="50" data-priority="' + type + '" style="width:100%;accent-color:#e58b3d">';
                container.appendChild(row);
                row.querySelector("[data-flak-type]").onchange = event => {
                    const cannon = this.getSettingsFlakCannon();
                    if (!cannon) return;
                    cannon.targetTypes = cannon.targetTypes || {};
                    cannon.targetTypes[type] = event.target.checked;
                    this.refreshFlakSettingsUI();
                };
                row.querySelector("[data-priority]").oninput = event => {
                    const cannon = this.getSettingsFlakCannon();
                    if (!cannon) return;
                    cannon.targetPriorities = cannon.targetPriorities || {};
                    cannon.targetPriorities[type] = Number(event.target.value);
                    this.refreshFlakSettingsUI();
                };
            }
        }
        this.refreshFlakSettingsUI();
    },

    getSettingsFlakCannon() {
        const selected = this.selectedCannons.length ? this.selectedCannons :
            (this.selectedCannon ? [this.selectedCannon] : []);
        return selected.length === 1 && selected[0].team === "player" &&
            selected[0].weaponType === "flakCannon" ? selected[0] : null;
    },

    refreshFlakSettingsUI() {
        const button = document.getElementById("btn-flak-settings");
        const panel = document.getElementById("flak-settings-panel");
        if (!button || !panel) return;
        const cannon = this.getSettingsFlakCannon();
        // The settings control and panel are available only while the Tools tab is active.
        const inToolsTab = !!window.Game && window.Game.activeToolTab === "tools";
        const showButton = inToolsTab;
        const showPanel = inToolsTab && panel.dataset.open === "true" && !!cannon;
        button.hidden = !showButton;
        button.style.display = showButton ? "" : "none";
        panel.hidden = !showPanel;
        panel.style.display = showPanel ? "block" : "none";
        button.title = cannon
            ? "Configure the selected Flak Cannon"
            : "Select one player Flak Cannon to configure its settings";
        if (!cannon) {
            panel.dataset.open = "false";
            panel.hidden = true;
            panel.style.display = "none";
            button.classList.remove("active");
            return;
        }
        button.classList.toggle("active", panel.dataset.open === "true" && inToolsTab);
        const auto = cannon.autoDefense !== false;
        panel.querySelector("#flak-mode-auto").classList.toggle("active", auto);
        panel.querySelector("#flak-mode-manual").classList.toggle("active", !auto);
        const targetTypes = cannon.targetTypes || {};
        const priorities = cannon.targetPriorities || {};
        for (const type of ["cannon", "machineGun", "megaCannon", "sniper"]) {
            const enabled = targetTypes[type] !== false;
            const priority = Math.max(0, Math.min(100, Number(priorities[type] ?? 50)));
            const checkbox = panel.querySelector('[data-flak-type="' + type + '"]');
            const slider = panel.querySelector('[data-priority="' + type + '"]');
            checkbox.checked = enabled;
            slider.value = String(priority);
            slider.disabled = !enabled;
            panel.querySelector('[data-priority-value="' + type + '"]').textContent = priority + "%";
        }
    },

    startResearch(projectId) {
        const project = this.researchProjects[projectId];
        if (!project || project.unlocked || project.researching) return false;
        if (Building.resources.metal < project.metalCost) {
            Building.showPlacementMessage("Research requires " + project.metalCost + " Metal.");
            return false;
        }
        Building.resources.metal -= project.metalCost;
        project.progress = 0;
        project.researching = true;
        Building.updateHUD();
        if (window.Game && Game.refreshResearchMenu) Game.refreshResearchMenu();
        return true;
    },

    isResearched(projectId) {
        return !!(this.researchProjects[projectId] && this.researchProjects[projectId].unlocked);
    },

    updateResearch(delta) {
        const project = this.researchProjects.flakCannon;
        if (!project || !project.researching) return;
        project.progress = Math.min(project.duration, project.progress + delta / 1000);
        this.researchRefreshTimer += delta;
        if (project.progress >= project.duration) {
            project.progress = project.duration;
            project.researching = false;
            project.unlocked = true;
            this.updateToolButtons();
            if (window.Game && Game.refreshResearchMenu) Game.refreshResearchMenu();
            Building.showPlacementMessage("Research complete: Flak Cannon unlocked!");
        } else if (this.researchRefreshTimer >= 200) {
            this.researchRefreshTimer = 0;
            if (window.Game && Game.refreshResearchMenu) Game.refreshResearchMenu();
        }
    },

    createWeaponButton(id, label, weaponType, costLabel) {
        let button = document.getElementById("btn-" + id);
        if (!button) {
            button = document.createElement("button");
            button.id = "btn-" + id;
            button.type = "button";
            button.innerHTML = label + "<small>" + costLabel + "</small>";
        }

        // Always normalize metadata, including buttons authored in index.html.
        // This keeps static and dynamically-created weapons in the same tab.
        button.classList.add("tool");
        button.dataset.toolCategory = "weapons";
        button.type = "button";
        button.title = weaponType === "machineGun"
            ? "7 damage per shot • 0.12 second reload • hold to fire"
            : weaponType === "megaCannon"
                ? "220 damage • 15 second reload • visible cooldown"
                : weaponType === "sniper"
                    ? "95 damage • perfectly straight, fast shot • 5.5 second reload"
                    : "Intercepts enemy bullets with proximity-fused explosions";

        const cannonButton = document.getElementById("btn-cannon");
        const previousButton = weaponType === "machineGun"
            ? cannonButton
            : weaponType === "megaCannon"
                ? document.getElementById("btn-machine-gun") || cannonButton
                : weaponType === "sniper"
                    ? document.getElementById("btn-mega-cannon") || cannonButton
                    : document.getElementById("btn-sniper") || document.getElementById("btn-mega-cannon") || cannonButton;
        if (previousButton && previousButton.parentElement &&
            button.previousElementSibling !== previousButton) {
            previousButton.insertAdjacentElement("afterend", button);
        } else if (!button.parentElement) {
            (document.querySelector(".toolbar") || document.body).appendChild(button);
        }

        button.disabled = weaponType === "flakCannon" && !this.isResearched("flakCannon");
        button.title = weaponType === "flakCannon" && !this.isResearched("flakCannon")
            ? "Research this weapon at a Research Station (40 Metal, 10 seconds)"
            : button.title;
        button.onclick = () => {
            if (weaponType === "flakCannon" && !this.isResearched("flakCannon")) {
                if (window.Game && Game.openResearchMenu) Game.openResearchMenu();
                Building.showPlacementMessage("Research the Flak Cannon at a Research Station first.");
                return;
            }
            const alreadySelected = this.selectedTool === "cannon" &&
                this.selectedWeaponType === weaponType;
            if (typeof Building !== "undefined") {
                // Weapon and mine tools take priority over door construction.
                Building.doorMaterial = null;
                Building.doorModifierDrag = null;
                if (Building.hideDoorConfirm) Building.hideDoorConfirm();
                Building.utilityTool = null;
                Building.repairMode = false;
                Building.repairTarget = null;
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
            ["btn-mega-cannon", "megaCannon"],
            ["btn-sniper", "sniper"],
            ["btn-flak-cannon", "flakCannon"]
        ];
        for (const [id, type] of buttons) {
            const button = document.getElementById(id);
            if (button && type === "flakCannon") {
                button.disabled = !this.isResearched("flakCannon");
                if (button.disabled) {
                    button.title = "Research this weapon at a Research Station (40 Metal, 10 seconds)";
                } else {
                    button.title = "Intercepts enemy bullets with proximity-fused explosions";
                }
            }
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
        this.hideSniperFireButton();
        this.selectedTool = null; this.linkMode = false; this.linkSource = null; this.mineDragging = false; this.sniperAimDrag = null;
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
    setLinkMode(enabled) {
        const next = !!enabled;

        // Clear every other active action before enabling Link. Do not route
        // this through a toggle that can accidentally turn Link straight back off.
        this.selectedCannon = null;
        this.selectedCannons = [];
        this.groupSelectMode = false;
        const groupButton = document.querySelector('[data-mobile-action="group-select"]');
        if (groupButton) groupButton.classList.remove("active");
        this.hideSniperFireButton();
        this.selectedTool = null;
        this.fireHeld = false;
        this.mineDragging = false;
        this.linkSource = null;
        this.linkHoverDoor = null;
        this.lastCannonClick = 0;
        this.lastClickedCannon = null;

        if (typeof Building !== "undefined") {
            Building.doorMaterial = null;
            Building.utilityTool = null;
            Building.repairMode = false;
            Building.repairTarget = null;
            Building.deleteMode = false;
            Building.drag = null;
            Building.doorModifierDrag = null;
            if (Building.hideDoorConfirm) Building.hideDoorConfirm();
        }

        this.linkMode = next;
        this.selectedTool = next ? "link" : null;
        // Snapshot player doors once when entering Link mode. Hit testing
        // now visits doors only, not every structural beam.
        this.linkDoorTargets = next
            ? Building.struts.filter(strut => strut.isDoor && strut.team === "player")
            : [];
        this.syncLinkedDoors();

        if (typeof Building !== "undefined") Building.updateToolbar();
        this.updateToolButtons();

        // Remove stale visual selection from any tool not covered by a mode.
        document.querySelectorAll(".toolbar .tool").forEach(button => {
            if (button.id === "btn-link") return;
            button.classList.remove("active", "selected", "is-selected");
            if (button.hasAttribute("aria-pressed")) button.setAttribute("aria-pressed", "false");
        });
        const linkButton = document.getElementById("btn-link");
        if (linkButton) {
            linkButton.classList.toggle("active", next);
            linkButton.setAttribute("aria-pressed", String(next));
        }
    },
    findLinkDoorAtPoint(x, y) {
        // Fast scalar hit-test: no temporary arrays/objects or sorting.
        // Check the swung leaf and its original beam position.
        const doors = this.linkDoorTargets;
        for (let i = doors.length - 1; i >= 0; i--) {
            const d = doors[i];
            if (!d.isDoor || d.team !== "player" || !d.a || !d.b ||
                d.a.removed || d.b.removed) continue;
            const a = d.a.body.position, b = d.b.body.position;
            // Treat the whole door beam AND both endpoint nodes as one target.
            // This makes the target forgiving on touch screens without scanning
            // unrelated structural beams.
            const nodeRadiusSq = 58 * 58;
            const ax = x - a.x, ay = y - a.y;
            const bx = x - b.x, by = y - b.y;
            if (ax * ax + ay * ay <= nodeRadiusSq ||
                bx * bx + by * by <= nodeRadiusSq) return d;
            const dx = b.x - a.x, dy = b.y - a.y;
            const lenSq = dx * dx + dy * dy;
            if (lenSq < 1) continue;
            const t = Math.max(0, Math.min(1, ((x-a.x)*dx + (y-a.y)*dy)/lenSq));
            const closedX = a.x + t*dx, closedY = a.y + t*dy;
            const closedDx = x-closedX, closedDy = y-closedY;
            let bestSq = closedDx*closedDx + closedDy*closedDy;
            const swing = (d.doorOpenAmount || 0) * Math.PI / 2;
            if (swing > 0.015) {
                const angle = Math.atan2(dy,dx) + swing;
                const ex = a.x + Math.cos(angle)*Math.sqrt(lenSq);
                const ey = a.y + Math.sin(angle)*Math.sqrt(lenSq);
                const odx = ex-a.x, ody = ey-a.y;
                const olenSq = odx*odx + ody*ody;
                const ot = Math.max(0,Math.min(1,((x-a.x)*odx+(y-a.y)*ody)/olenSq));
                const ox=x-(a.x+ot*odx), oy=y-(a.y+ot*ody);
                bestSq = Math.min(bestSq,ox*ox+oy*oy);
            }
            if (bestSq <= 58*58) return d;
        }
        return null;
    },
    handleLinkPointerDown(x, y) {
        if (!this.linkMode) return false;

        // Link mode owns every pointer-down. Never let an unrecognized tap
        // fall through to Building.startDrag(), which can begin a costly
        // beam extrusion while the player is only trying to select a link.
        if (this.linkSource) {
            const door = this.findLinkDoorAtPoint(x, y);
            if (door) {
                const added = this.linkDoorToWeapon(this.linkSource, door);
                this.linkHoverDoor = null;
                Building.showPlacementMessage(added ? "Door linked." : "Door unlinked.");
            }
            // A tap outside a door beam or either endpoint is intentionally a
            // no-op. Keep Link mode active and do not touch building drag state.
            return true;
        }

        // Select a player weapon with a compact, allocation-free hit test.
        for (let i = this.cannons.length - 1; i >= 0; i--) {
            const c = this.cannons[i];
            if (c.team !== "player" || !c.node || c.node.removed) continue;
            const p = c.node.body.position;
            const dx=x-p.x, dy=y-p.y, angle=c.angle||0;
            const localX=dx*Math.cos(angle)+dy*Math.sin(angle);
            const localY=-dx*Math.sin(angle)+dy*Math.cos(angle);
            const type=c.weaponType||"cannon";
            const barrelLength=type==="megaCannon"?43:type==="flakCannon"?38:type==="machineGun"?27:32;
            const barrelHeight=type==="megaCannon"?14:type==="flakCannon"?16:type==="machineGun"?7:10;
            if (dx*dx+dy*dy <= 32*32 ||
                (localX>=-10 && localX<=barrelLength+16 &&
                 Math.abs(localY)<=barrelHeight/2+18)) {
                this.linkSource=c;
                this.linkHoverDoor=null;
                Building.showPlacementMessage("Weapon selected — tap a door to link it.");
                return true;
            }
        }

        Building.showPlacementMessage("Select a weapon first.");
        return true;
    },
    forceDeselectGuns() {
        // Hard-reset every state field that can keep a gun visually or
        // behaviorally selected. Preserve unrelated modes such as Link/Mine.
        this.hideSniperFireButton();
        this.sniperAimDrag = null;
        this.selectedCannon = null;
        this.selectedCannons = [];
        this.groupSelectMode = false;
        const groupButton = document.querySelector('[data-mobile-action="group-select"]');
        if (groupButton) groupButton.classList.remove("active");
        this.fireHeld = false;
        if (this.selectedTool === "cannon") this.selectedTool = null;
        this.lastCannonClick = 0;
        this.lastClickedCannon = null;
        this.syncLinkedDoors();
        this.updateToolButtons();
        return !this.selectedCannon &&
            this.selectedCannons.length === 0 &&
            this.fireHeld === false &&
            this.selectedTool !== "cannon";
    },
    clearSelectedCannon() {
        this.hideSniperFireButton();
        this.selectedCannon = null;
        this.selectedCannons = [];
        this.groupSelectMode = false;
        const groupButton = document.querySelector('[data-mobile-action="group-select"]');
        if (groupButton) groupButton.classList.remove("active");
        this.fireHeld = false;
        this.sniperAimDrag = null;
        this.syncLinkedDoors();
        this.lastCannonClick = 0;
        this.lastClickedCannon = null;
    },

    addCannon(node, team = "player", isAI = false, weaponType = "cannon") {
        if (!node || node.removed) return null;
        if (team === "player" && weaponType === "flakCannon" && !this.isResearched("flakCannon")) return null;
        if (this.cannons.some(c => c.node === node)) return null;
        const stats = this.weaponStats[weaponType] || this.weaponStats.cannon;
        const cannon = {
            node,
            team,
            isAI,
            weaponType: this.weaponStats[weaponType] ? weaponType : "cannon",
            angle: team === "enemy" ? Math.PI : 0,
            cooldown: 0,
            cooldownMax: stats.cooldown,
            autoDefense: true,
            targetTypes: { cannon: true, machineGun: true, megaCannon: true, sniper: true },
            targetPriorities: { cannon: 50, machineGun: 50, megaCannon: 50, sniper: 50 }
        };

        this.cannons.push(cannon);
        return cannon;
    },

    handlePointerMove(x, y) {
        this.mouse.x = x;
        this.mouse.y = y;
        // Do not scan every building beam on pointer movement. Door hit
        // testing happens only once on pointerdown, avoiding per-frame lag.

        const selected = this.selectedCannons.length
            ? this.selectedCannons
            : (this.selectedCannon ? [this.selectedCannon] : []);

        for (const cannon of selected) {
            if (!cannon.node || cannon.node.removed) continue;
            if (cannon.weaponType === "sniper" &&
                (!this.sniperAimDrag || this.sniperAimDrag.cannon !== cannon)) continue;
            const pos = cannon.node.body.position;
            let angle = Math.atan2(y - pos.y, x - pos.x);
            if (cannon.weaponType === "sniper") {
                // The player-side Sniper aims forward only, with a generous vertical arc.
                angle = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, angle));
            }
            cannon.angle = angle;
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
            if (this.selectedWeaponType === "flakCannon" && !this.isResearched("flakCannon")) {
                if (window.Game && Game.openResearchMenu) Game.openResearchMenu();
                Building.showPlacementMessage("Research the Flak Cannon first: 40 Metal and 10 seconds.");
                this.clearSelectedTool();
                return true;
            }
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
            const bodyRadius = type === "megaCannon" ? 14 : type === "sniper" ? 12 : 11;
            if (Math.hypot(dx, dy) <= bodyRadius + 2) return true;

            const angle = c.angle || 0;
            const localX = dx * Math.cos(angle) + dy * Math.sin(angle);
            const localY = -dx * Math.sin(angle) + dy * Math.cos(angle);
            const barrelLength = type === "sniper" ? 52 : type === "megaCannon" ? 43 : type === "flakCannon" ? 38 : type === "machineGun" ? 27 : 32;
            const barrelHeight = type === "sniper" ? 6 : type === "megaCannon" ? 14 : type === "flakCannon" ? 16 : type === "machineGun" ? 7 : 10;
            return localX >= -2 && localX <= barrelLength + 4 &&
                Math.abs(localY) <= barrelHeight / 2 + 2;
        });

        if (clickedCannon) {
            const selectedIndex = this.selectedCannons.indexOf(clickedCannon);

            if (ctrlKey || this.groupSelectMode) {
                // Desktop Ctrl-click or held Android GROUP toggles any number of guns.
                if (selectedIndex >= 0) {
                    this.selectedCannons.splice(selectedIndex, 1);
                } else {
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
            this.lastCannonClick = 0;
            this.lastClickedCannon = null;

            // Selecting a Sniper immediately displays its persistent Fire control.
            // Dragging from the cannon still adjusts aim; releasing never fires.
            if (clickedCannon.weaponType === "sniper" &&
                this.selectedCannons.length === 1 &&
                this.selectedCannons[0] === clickedCannon) {
                this.sniperAimDrag = { cannon: clickedCannon };
                this.handlePointerMove(x, y);
            } else {
                this.sniperAimDrag = null;
                this.handlePointerMove(x, y);
            }
            this.updateSniperFireButton();
            this.refreshFlakSettingsUI();
            return true;
        }

        const selected = this.selectedCannons.length
            ? this.selectedCannons
            : (this.selectedCannon ? [this.selectedCannon] : []);

        if (selected.length) {
            if (selected.length === 1 && selected[0].weaponType === "sniper") {
                // Sniper uses press-drag-release: aim while held, fire only on release.
                this.sniperAimDrag = { cannon: selected[0] };
                this.handlePointerMove(x, y);
                return true;
            }
            this.handlePointerMove(x, y);
            this.fireHeld = selected.some(cannon => cannon.weaponType === "machineGun");
            for (const cannon of selected) this.fire(cannon);
            return true;
        }

        return false;
    },

    handlePointerUp(x, y) {
        this.fireHeld = false;
        if (this.sniperAimDrag) {
            const cannon = this.sniperAimDrag.cannon;
            this.handlePointerMove(x, y);
            this.sniperAimDrag = null;
            // Keep the Fire control visible; the player fires with its button.
            this.updateSniperFireButton();
            return true;
        }
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

    cancelSniperAim() {
        this.sniperAimDrag = null;
        this.updateSniperFireButton();
    },

    spawnProjectile(cannon, shotAngle, stats) {
        const start = cannon.node.body.position;
        const weaponType = cannon.weaponType || "cannon";
        const projectile = Matter.Bodies.circle(
            start.x + Math.cos(shotAngle) * 34,
            start.y + Math.sin(shotAngle) * 34,
            stats.radius,
            {
                label: "cannon-projectile",
                density: 0.003,
                frictionAir: weaponType === "sniper" ? 0 : 0.002,
                restitution: 0.1,
                isSensor: true
            }
        );

        projectile.isProjectile = true;
        // The Sniper projectile is a true straight-line shot, unaffected by gravity.
        projectile.noGravity = weaponType === "sniper";
        // Easy AI standard cannons deal slightly reduced damage.
        // Player weapons and all other difficulty modes retain full damage.
        projectile.damage = cannon.team === "enemy" &&
            window.AI && window.AI.difficulty === "easy" && weaponType === "cannon"
            ? Math.round(stats.damage * 0.85)
            : stats.damage;
        projectile.team = cannon.team;
        projectile.weaponType = weaponType;
        projectile.life = 20000;
        if (weaponType === "flakCannon") {
            projectile.flakFuse = stats.fuse || 1050;
            projectile.blastRadius = stats.blastRadius || 76;
        }
        projectile.displayRadius = Math.max(4, stats.radius);
        projectile.hasHit = false;
        projectile.previousPosition = { x: projectile.position.x, y: projectile.position.y };

        Matter.Composite.add(Physics.world, projectile);
        Matter.Body.setVelocity(projectile, {
            x: Math.cos(shotAngle) * stats.speed,
            y: Math.sin(shotAngle) * stats.speed
        });
        this.projectiles.push(projectile);
        return projectile;
    },

    fire(cannon) {
        if (!cannon || !cannon.node || cannon.node.removed || cannon.cooldown > 0) return;

        const stats = this.weaponStats[cannon.weaponType] || this.weaponStats.cannon;
        const weaponType = cannon.weaponType || "cannon";
        const angle = cannon.angle;

        if (weaponType === "flakCannon") {
            // Easy-mode AI flak is deliberately limited to two shells.
            // Player flak and every other difficulty retain the normal volley.
            const easyAI = cannon.team === "enemy" &&
                window.AI && window.AI.difficulty === "easy";
            const count = easyAI ? 2 : Math.max(2, stats.volleyCount || 11);
            const spread = stats.spread || 0.72;
            cannon.flakBurstShots = Array.from({ length: count }, (_, i) =>
                angle - spread / 2 + spread * (i / (count - 1))
            );
            cannon.flakBurstTimer = 0;
        } else {
            this.spawnProjectile(cannon, angle, stats);
        }

        cannon.cooldownMax = stats.cooldown;
        cannon.cooldown = stats.cooldown;
    },

    update(delta = 16.667) {
        this.updateResearch(delta);
        const seconds = delta / 1000;

        for (const cannon of this.cannons) {
            if (cannon.flakBurstShots && cannon.flakBurstShots.length) {
                cannon.flakBurstTimer = (cannon.flakBurstTimer || 0) - delta;
                while (cannon.flakBurstTimer <= 0 && cannon.flakBurstShots.length) {
                    const shotAngle = cannon.flakBurstShots.shift();
                    this.spawnProjectile(cannon, shotAngle, this.weaponStats.flakCannon);
                    cannon.flakBurstTimer += this.weaponStats.flakCannon.burstInterval || 55;
                }
                if (!cannon.flakBurstShots.length) {
                    cannon.flakBurstShots = null;
                    cannon.flakBurstTimer = 0;
                }
            }
            if (cannon.cooldown > 0) {
                cannon.cooldown = Math.max(0, cannon.cooldown - seconds);
            }
        }

        // Player Flak Cannons provide automatic projectile defense.
        // This intentionally ignores buildings and every other weapon type.
        for (const cannon of this.cannons) {
            if (cannon.team !== "player" || cannon.weaponType !== "flakCannon" ||
                cannon.autoDefense === false ||
                !cannon.node || cannon.node.removed || cannon.cooldown > 0 ||
                (cannon.flakBurstShots && cannon.flakBurstShots.length)) continue;

            const origin = cannon.node.body.position;
            const range = 900;
            let target = null;
            let targetDistance = Infinity;
            let bestScore = -Infinity;
            const targetTypes = cannon.targetTypes || {};

            for (const projectile of this.projectiles) {
                const type = projectile.weaponType || "cannon";
                if (projectile.team === cannon.team ||
                    type === "flakCannon" || targetTypes[type] === false ||
                    !["cannon", "machineGun", "megaCannon", "sniper"].includes(type) ||
                    projectile.hasHit || projectile.intercepted) continue;

                const dx = projectile.position.x - origin.x;
                const dy = projectile.position.y - origin.y;
                const distance = Math.hypot(dx, dy);
                if (distance > range) continue;

                const priority = Math.max(0, Math.min(100,
                    Number((cannon.targetPriorities || {})[type] ?? 50)));
                if (priority <= 0) continue;
                // Priority percentage dominates; distance breaks ties between equally
                // prioritized projectile types so nearby threats are handled first.
                const score = priority - (distance / range) * 0.01;
                if (score <= bestScore) continue;

                target = projectile;
                targetDistance = distance;
                bestScore = score;
            }

            if (!target) continue;

            // Lead the target using its current velocity so the flak volley
            // aims at where the hostile projectile is going, not where it was.
            const velocity = target.velocity || { x: 0, y: 0 };
            const interceptTime = Math.min(1.5, targetDistance /
                Math.max(1, this.weaponStats.flakCannon.speed));
            const predictedX = target.position.x + velocity.x * interceptTime;
            const predictedY = target.position.y + velocity.y * interceptTime;
            cannon.angle = Math.atan2(predictedY - origin.y, predictedX - origin.x);
            this.fire(cannon);
        }

        this.updateSniperFireButton();

        if (this.fireHeld) {
            const selected = this.selectedCannons.length
                ? this.selectedCannons
                : (this.selectedCannon ? [this.selectedCannon] : []);
            for (const cannon of selected) {
                if (cannon.weaponType === "machineGun") this.fire(cannon);
            }
        }

        for (const explosion of this.flakExplosions) explosion.life -= delta;
        this.flakExplosions = this.flakExplosions.filter(explosion => explosion.life > 0);

        for (const projectile of [...this.projectiles]) {
            // A flak blast may have removed a later projectile from this
            // frame's iteration snapshot; never process that intercepted shot.
            if (!this.projectiles.includes(projectile)) continue;
            projectile.life -= delta;

            // Flak shells detonate on hostile-fire proximity or when their
            // short fuse expires. They only intercept bullets, not structures.
            if (projectile.weaponType === "flakCannon") {
                projectile.flakFuse -= delta;
                const intercepted = this.projectiles.some(other =>
                    other !== projectile &&
                    other.team !== projectile.team &&
                    other.weaponType !== "flakCannon" &&
                    !other.hasHit &&
                    Math.hypot(
                        other.position.x - projectile.position.x,
                        other.position.y - projectile.position.y
                    ) <= 58
                );
                if (intercepted || projectile.flakFuse <= 0 || projectile.life <= 0) {
                    this.detonateFlak(projectile);
                }
                projectile.previousPosition = { x: projectile.position.x, y: projectile.position.y };
                continue;
            }

            // Matter sensors can occasionally miss fast, thin-beam contacts.
            // Sweep the bullet's movement segment against enemy joints/beams as
            // a reliable fallback so a fast projectile cannot tunnel through.
            if (!projectile.hasHit && projectile.previousPosition) {
                const from = projectile.previousPosition;
                const to = projectile.position;
                const hitRadius = (projectile.displayRadius || 4) + 7;
                const pointDistance = (px, py, a, b) => {
                    const dx = b.x - a.x, dy = b.y - a.y;
                    const lengthSq = dx * dx + dy * dy;
                    const t = lengthSq ? Math.max(0, Math.min(1,
                        ((px - a.x) * dx + (py - a.y) * dy) / lengthSq)) : 0;
                    return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
                };
                const segmentsCross = (a, b, c, d) => {
                    const cross = (p, q, r) => (q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
                    const ab1 = cross(a,b,c), ab2 = cross(a,b,d);
                    const cd1 = cross(c,d,a), cd2 = cross(c,d,b);
                    return ab1 * ab2 <= 0 && cd1 * cd2 <= 0;
                };
                const segmentDistance = (a, b, c, d) => segmentsCross(a,b,c,d) ? 0 : Math.min(
                    pointDistance(a.x,a.y,c,d), pointDistance(b.x,b.y,c,d),
                    pointDistance(c.x,c.y,a,b), pointDistance(d.x,d.y,a,b)
                );

                const hitNode = Building.nodes.find(node =>
                    !node.removed && node.team !== projectile.team &&
                    pointDistance(node.body.position.x, node.body.position.y, from, to) <= hitRadius + 8
                );
                if (hitNode) {
                    projectile.hasHit = true;
                    Building.damageNode(hitNode.body, projectile.damage || 35);
                } else {
                    const hitBeam = Building.struts.find(strut =>
                        !strut.removed && strut.team !== projectile.team &&
                        strut.a && strut.b && !strut.a.removed && !strut.b.removed &&
                        !(strut.isDoor && (strut.doorOpen || strut.doorCollisionOpen)) &&
                        segmentDistance(from, to, strut.a.body.position, strut.b.body.position) <= hitRadius + (strut.width || 8) / 2
                    );
                    if (hitBeam) {
                        projectile.hasHit = true;
                        Building.damageStrut(hitBeam.body, projectile.damage || 35);
                    }
                }
            }
            projectile.previousPosition = { x: projectile.position.x, y: projectile.position.y };

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
        this.refreshFlakSettingsUI();
    },

    detonateFlak(shell) {
        if (!shell || shell.flakDetonated) return;
        shell.flakDetonated = true;
        const center = { x: shell.position.x, y: shell.position.y };
        const radius = shell.blastRadius || 76;
        const radiusSq = radius * radius;
        this.flakExplosions.push({ x: center.x, y: center.y, radius, life: 280, maxLife: 280 });

        // Hostile bullets caught in the blast are removed; friendly bullets
        // and other flak shells remain untouched.
        for (const target of [...this.projectiles]) {
            if (target === shell || target.team === shell.team ||
                target.weaponType === "flakCannon" || target.hasHit) continue;
            const dx = target.position.x - center.x;
            const dy = target.position.y - center.y;
            if (dx * dx + dy * dy <= radiusSq) {
                target.intercepted = true;
                Matter.Composite.remove(Physics.world, target);
                this.projectiles = this.projectiles.filter(item => item !== target);
            }
        }
        Matter.Composite.remove(Physics.world, shell);
        this.projectiles = this.projectiles.filter(item => item !== shell);
    },

    draw(ctx) {
        for (const explosion of this.flakExplosions) {
            const progress = 1 - explosion.life / explosion.maxLife;
            const radius = explosion.radius * (0.35 + progress * 0.65);
            ctx.save();
            ctx.globalAlpha = Math.max(0, explosion.life / explosion.maxLife);
            ctx.beginPath();
            ctx.arc(explosion.x, explosion.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255, 170, 65, .22)";
            ctx.fill();
            ctx.lineWidth = 4 * (1 - progress) + 1;
            ctx.strokeStyle = "#ffcf70";
            ctx.shadowColor = "#ff8b35";
            ctx.shadowBlur = 18;
            ctx.stroke();
            ctx.restore();
        }

        if (this.linkMode) {
            ctx.save(); ctx.setLineDash([7, 6]); ctx.lineWidth = 2; ctx.strokeStyle = "rgba(104,220,255,.72)";
            for (const link of this.links) { if (!this.cannons.includes(link.weapon) || !Building.struts.includes(link.door)) continue; const p = link.weapon.node.body.position, d = link.door; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo((d.a.body.position.x + d.b.body.position.x) / 2, (d.a.body.position.y + d.b.body.position.y) / 2); ctx.stroke(); }
            ctx.setLineDash([]);
            if (this.linkSource && this.linkSource.node && !this.linkSource.node.removed) {
                const p = this.linkSource.node.body.position;
                ctx.beginPath(); ctx.arc(p.x, p.y, 27, 0, Math.PI * 2);
                ctx.strokeStyle = "#ffe66d"; ctx.lineWidth = 3; ctx.stroke();
                // Live dotted guide uses cached pointer coordinates only.
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(this.mouse.x, this.mouse.y);
                ctx.setLineDash([3, 5]);
                ctx.strokeStyle = "rgba(255,230,109,.85)";
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.setLineDash([]);
            }
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
                    : type === "flakCannon"
                        ? "#e58b3d"
                        : type === "sniper"
                            ? "#54c9e8"
                            : (cannon.team === "enemy" ? "#e16b70" : "#8796a5");
            const barrelLength = type === "sniper" ? 52 : type === "megaCannon" ? 43 : type === "flakCannon" ? 38 : type === "machineGun" ? 27 : 32;
            const barrelHeight = type === "sniper" ? 6 : type === "megaCannon" ? 14 : type === "flakCannon" ? 16 : type === "machineGun" ? 7 : 10;
            ctx.fillRect(0, -barrelHeight / 2, barrelLength, barrelHeight);
            ctx.fillStyle = "#394653";
            ctx.fillRect(barrelLength - 5, -barrelHeight / 2 - 1, 8, barrelHeight + 2);

            ctx.restore();

            if (cannon.cooldown > 0) {
                const stats = this.weaponStats[cannon.weaponType] || this.weaponStats.cannon;
                const progress = Math.max(0, Math.min(1, cannon.cooldown / (cannon.cooldownMax || stats.cooldown)));
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, 19, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
                ctx.strokeStyle = cannon.weaponType === "megaCannon" ? "#d98aff" : cannon.weaponType === "flakCannon" ? "#ff9b4a" : cannon.weaponType === "sniper" ? "#54c9e8" : "#ffd166";
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
            const color = projectile.weaponType === "flakCannon"
                ? "#ff9b4a"
                : projectile.weaponType === "sniper"
                    ? "#54c9e8"
                    : projectile.team === "enemy" ? "#ff3b4f" : "#ffe066";
            const velocity = projectile.velocity || { x: 0, y: 0 };
            const speed = Math.hypot(velocity.x, velocity.y) || 1;
            const trailLength = Math.min(24, speed * 1.8);

            ctx.save();
            ctx.globalAlpha = 0.95;
            ctx.strokeStyle = color;
            ctx.lineWidth = Math.max(2, (projectile.displayRadius || 4) * 0.9);
            ctx.lineCap = "round";
            ctx.shadowColor = color;
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.moveTo(
                projectile.position.x - velocity.x / speed * trailLength,
                projectile.position.y - velocity.y / speed * trailLength
            );
            ctx.lineTo(projectile.position.x, projectile.position.y);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(projectile.position.x, projectile.position.y,
                Math.max(4, projectile.displayRadius || 4), 0, Math.PI * 2);
            ctx.fillStyle = "#ffffff";
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = color;
            ctx.stroke();
            ctx.restore();
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