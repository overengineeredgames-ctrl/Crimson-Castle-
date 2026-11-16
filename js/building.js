
"use strict";

const Building = {
    nodes: [],
    struts: [],
    mines: [],
    drag: null,

    material: "wood",
    gridSize: 30,
    gridEnabled: true,

    nodeRadius: CONFIG.NODE_RADIUS || 6,
    coreRadius: (CONFIG.NODE_RADIUS || 6) * 2,
    coreHealth: 500,
    groundY: 0,

    resources: {
        metal: CONFIG.STARTING_METAL || 500,
        energy: CONFIG.STARTING_ENERGY || 100
    },

    settings(material = this.material) {
        if (material === "steel") {
            return {
                stiffness: CONFIG.STEEL_STIFFNESS || 0.98,
                density: CONFIG.STEEL_DENSITY || 0.003,
                cost: CONFIG.STEEL_COST || 25,
                color: CONFIG.COLORS.steel,
                dark: CONFIG.COLORS.steelDark,
                width: 9,
                maxLength: CONFIG.MAX_STRUT_LENGTH || 220,
                breakRatio: 1.7,
                maxHealth: 400
            };
        }

        return {
            stiffness: CONFIG.WOOD_STIFFNESS || 0.85,
            density: CONFIG.WOOD_DENSITY || 0.001,
            cost: CONFIG.WOOD_COST || 10,
            color: CONFIG.COLORS.wood,
            dark: CONFIG.COLORS.woodDark,
            width: 7,
            maxLength: CONFIG.MAX_STRUT_LENGTH || 220,
            breakRatio: 1.35,
            maxHealth: 180
        };
    },

    init() {
        this.nodes = [];
        this.struts = [];
        this.mines = [];
        this.drag = null;

        this.resources = {
            metal: CONFIG.STARTING_METAL || 500,
            energy: CONFIG.STARTING_ENERGY || 100
        };

        this.groundY = Physics.groundY;

        this.createStartingFort();
        this.setupToolbar();
        this.updateHUD();
    },

    snap(value) {
        if (!this.gridEnabled) return value;

        return Math.round(value / this.gridSize) * this.gridSize;
    },

    snapPoint(x, y) {
        return {
            x: this.snap(x),
            y: this.snap(y)
        };
    },

    distance(a, b) {
        return Math.hypot(a.x - b.x, a.y - b.y);
    },

    // Supports both getNearestNode(x, y, radius)
    // and the older getNearestNode({x, y}, radius) format.
    getNearestNode(x, y, radius = CONFIG.NODE_SNAP_RADIUS || 25) {
        if (typeof x === "object" && x !== null) {
            radius = typeof y === "number" ? y : radius;
            y = x.y;
            x = x.x;
        }

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return null;
        }

        let nearest = null;
        let bestDistance = radius;

        for (const node of this.nodes) {
            if (node.removed) continue;

            const d = this.distance(node.body.position, { x, y });

            if (d < bestDistance) {
                bestDistance = d;
                nearest = node;
            }
        }

        return nearest;
    },

    createNode(x, y, options = {}) {
        const materialName = options.material || this.material;
        const material = this.settings(materialName);
        const isCore = !!options.isCore;
        const isFoundation = !!options.isFoundation;

        const body = Matter.Bodies.circle(
            x,
            y,
            isCore ? this.coreRadius : this.nodeRadius,
            {
                density: material.density,
                friction: 0.8,
                frictionStatic: 1,
                restitution: 0,
                slop: 0.01,

                // Foundations remain anchored to the ground.
                isStatic: isFoundation,

                label: isCore ? "fort-core" : "fort-node"
            }
        );

        body.isFortNode = true;

        const node = {
            body,
            team: options.team || "player",
            material: materialName,
            isFoundation,
            isCore,
            health: isCore ? this.coreHealth : material.maxHealth,
            maxHealth: isCore ? this.coreHealth : material.maxHealth,
            supported: isFoundation,
            removed: false
        };

        body.fortNode = node;

        this.nodes.push(node);
        Matter.Composite.add(Physics.world, body);

        return node;
    },

    createCore(x, y, team = "player") {
        return this.createNode(x, y, {
            isCore: true,
            team,
            material: "steel"
        });
    },

    createStrut(nodeA, nodeB, options = {}) {
        if (!nodeA || !nodeB || nodeA === nodeB) return null;
        if (nodeA.team !== nodeB.team) return null;

        const a = nodeA.body.position;
        const b = nodeB.body.position;

        const length = this.distance(a, b);
        const materialName = options.material || this.material;
        const material = this.settings(materialName);

        if (length < 5 || length > material.maxLength) {
            return null;
        }

        const duplicate = this.struts.some(strut =>
            (strut.a === nodeA && strut.b === nodeB) ||
            (strut.a === nodeB && strut.b === nodeA)
        );

        if (duplicate) return null;

        const constraint = Matter.Constraint.create({
            bodyA: nodeA.body,
            bodyB: nodeB.body,
            length,
            stiffness: material.stiffness,
            damping: 0.15,
            render: { visible: false }
        });

        // Non-physical sensor used for projectile detection.
        const beamBody = Matter.Bodies.rectangle(
            (a.x + b.x) / 2,
            (a.y + b.y) / 2,
            length,
            material.width,
            {
                isStatic: true,
                isSensor: true,
                friction: 0,
                restitution: 0,
                angle: Math.atan2(b.y - a.y, b.x - a.x),
                label: "fort-beam"
            }
        );

        beamBody.isFortBeam = true;
        beamBody.team = nodeA.team;

        const strut = {
            a: nodeA,
            b: nodeB,
            constraint,
            body: beamBody,
            material: materialName,
            length,
            health: material.maxHealth,
            maxHealth: material.maxHealth,
            width: material.width,
            breakRatio: material.breakRatio,
            team: nodeA.team
        };

        beamBody.fortStrut = strut;

        this.struts.push(strut);

        Matter.Composite.add(Physics.world, [
            constraint,
            beamBody
        ]);

        return strut;
    },

    createStartingFort(team = "player") {
        const cameraOffset = Math.max(
            0,
            (Physics.worldWidth - window.innerWidth) / 2
        );

        const worldWidth = Physics.worldWidth || window.innerWidth * 1.5;
        const baseY = this.groundY - this.nodeRadius;

        // Keep the player's fort on the left and mirror the same design
        // onto the right side for the enemy.
        const leftX = team === "enemy"
            ? Math.round(worldWidth * 0.65)
            : cameraOffset + 100;
        const rightX = leftX + 160;

        const bottomLeft = this.createNode(leftX, baseY, {
            isFoundation: true,
            team
        });

        const bottomRight = this.createNode(rightX, baseY, {
            isFoundation: true,
            team
        });

        const topLeft = this.createNode(leftX, baseY - 140, { team });
        const topRight = this.createNode(rightX, baseY - 140, { team });

        const core = this.createCore(
            leftX + 80,
            baseY - 90,
            team
        );

        // Use the exact same frame, braces, and core supports for both teams.
        this.createStrut(bottomLeft, bottomRight);
        this.createStrut(bottomLeft, topLeft);
        this.createStrut(bottomRight, topRight);
        this.createStrut(topLeft, topRight);

        this.createStrut(bottomLeft, topRight);
        this.createStrut(bottomRight, topLeft);

        this.createStrut(topLeft, core);
        this.createStrut(topRight, core);

        this.checkSupport();

        return { bottomLeft, bottomRight, topLeft, topRight, core };
    },

    isGroundConnected(node) {
        if (!node) return false;

        const visited = new Set();
        const queue = [node];

        while (queue.length) {
            const current = queue.shift();

            if (visited.has(current)) continue;

            visited.add(current);

            if (current.isFoundation) {
                return true;
            }

            for (const strut of this.struts) {
                if (strut.team !== node.team) continue;

                if (strut.a === current && !visited.has(strut.b)) {
                    queue.push(strut.b);
                }

                if (strut.b === current && !visited.has(strut.a)) {
                    queue.push(strut.a);
                }
            }
        }

        return false;
    },

    checkSupport() {
        const teams = [...new Set(this.nodes.map(node => node.team))];

        for (const team of teams) {
            const visited = new Set();

            const queue = this.nodes.filter(node =>
                node.team === team &&
                node.isFoundation &&
                !node.removed
            );

            for (const node of queue) {
                visited.add(node);
            }

            while (queue.length) {
                const current = queue.shift();

                for (const strut of this.struts) {
                    if (strut.team !== team) continue;

                    let next = null;

                    if (strut.a === current) next = strut.b;
                    if (strut.b === current) next = strut.a;

                    if (next && !next.removed && !visited.has(next)) {
                        visited.add(next);
                        queue.push(next);
                    }
                }
            }

            for (const node of this.nodes) {
                if (node.team !== team) continue;

                node.supported = visited.has(node);

                // Foundations are deliberately kept static.
                if (
                    !node.supported &&
                    node.body.isStatic &&
                    !node.isFoundation
                ) {
                    Matter.Body.setStatic(node.body, false);
                }
            }
        }
    },

    addMine(node) {
        if (!node || node.team !== "player") return false;
        if (!this.isGroundConnected(node)) return false;
        if (node.isFoundation || node.isCore) return false;

        if (this.mines.some(mine => mine.node === node)) {
            return false;
        }

        this.mines.push({
            node,
            team: node.team,
            energy: 0,
            energyPerSecond: 2,
            removed: false
        });

        this.updateHUD();

        return true;
    },

    setupToolbar() {
        const woodButton = document.getElementById("btn-wood");
        const steelButton = document.getElementById("btn-steel");

        if (woodButton) {
            woodButton.onclick = () => this.setMaterial("wood");
        }

        if (steelButton) {
            steelButton.onclick = () => this.setMaterial("steel");
        }

        this.updateToolbar();
    },

    setMaterial(material) {
        if (material !== "wood" && material !== "steel") return;

        this.material = material;
        this.updateToolbar();
    },

    updateToolbar() {
        const woodButton = document.getElementById("btn-wood");
        const steelButton = document.getElementById("btn-steel");

        if (woodButton) {
            woodButton.classList.toggle("active", this.material === "wood");
        }

        if (steelButton) {
            steelButton.classList.toggle("active", this.material === "steel");
        }
    },

    canAfford(amount) {
        return this.resources.metal >= amount;
    },

    charge(amount) {
        if (!this.canAfford(amount)) return false;

        this.resources.metal -= amount;
        this.updateHUD();

        return true;
    },

    startDrag(x, y, mode = "beam") {
        const node = this.getNearestNode(x, y);

        if (!node || node.team !== "player") {
            return false;
        }

        this.drag = {
            startNode: node,
            x,
            y,
            mode
        };

        return true;
    },

    setMousePosition(x, y) {
        if (!this.drag) return;

        const point = this.snapPoint(x, y);

        this.drag.x = point.x;
        this.drag.y = point.y;
    },

    finishDrag(x, y) {
        if (!this.drag) return false;

        const drag = this.drag;

        // Use the last known pointer position if coordinates are missing.
        if (!Number.isFinite(x)) x = drag.x;
        if (!Number.isFinite(y)) y = drag.y;

        this.drag = null;

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return false;
        }

        // Give the player a little extra room to snap onto an existing
        // node. Only consider nodes belonging to the same team.
        const snapRadius = Math.max(CONFIG.NODE_SNAP_RADIUS || 25, 35);
        let endNode = null;
        let bestDistance = snapRadius;

        for (const node of this.nodes) {
            if (
                node.removed ||
                node.team !== drag.startNode.team ||
                node === drag.startNode
            ) {
                continue;
            }

            const distance = this.distance(
                node.body.position,
                { x, y }
            );

            if (distance < bestDistance) {
                bestDistance = distance;
                endNode = node;
            }
        }

        if (endNode) {
            return this.finishBeam(drag.startNode, endNode);
        }

        return this.finishExtrusion(drag.startNode, x, y);
    },

    finishBeam(nodeA, nodeB) {
        const material = this.settings(this.material);

        if (!nodeA || !nodeB || nodeA === nodeB) {
            return false;
        }

        const length = this.distance(
            nodeA.body.position,
            nodeB.body.position
        );

        if (length > material.maxLength) return false;
        if (!this.charge(material.cost)) return false;

        const strut = this.createStrut(nodeA, nodeB);

        if (!strut) {
            this.resources.metal += material.cost;
            this.updateHUD();
            return false;
        }

        this.checkSupport();

        return true;
    },

    finishExtrusion(startNode, x, y) {
        if (!startNode || startNode.removed) return false;

        const material = this.settings(this.material);
        const start = startNode.body.position;
        const end = this.snapPoint(x, y);

        const length = this.distance(start, end);

        if (length < 20 || length > material.maxLength) {
            return false;
        }

        const cost = material.cost * 3;

        if (!this.charge(cost)) return false;

        const middle = {
            x: (start.x + end.x) / 2,
            y: (start.y + end.y) / 2 - 35
        };

        const newNode = this.createNode(end.x, end.y);
        const diagonalNode = this.createNode(middle.x, middle.y);

        const first = this.createStrut(startNode, diagonalNode);
        const second = this.createStrut(diagonalNode, newNode);
        const third = this.createStrut(startNode, newNode);

        if (!first || !second || !third) {
            this.removeNode(newNode);
            this.removeNode(diagonalNode);

            this.resources.metal += cost;
            this.updateHUD();

            return false;
        }

        this.checkSupport();

        return true;
    },

    removeStrut(strut, updateSupport = true) {
        if (!strut) return;

        Matter.Composite.remove(Physics.world, strut.constraint);
        Matter.Composite.remove(Physics.world, strut.body);

        const index = this.struts.indexOf(strut);

        if (index !== -1) {
            this.struts.splice(index, 1);
        }

        if (updateSupport) {
            this.checkSupport();
        }
    },

    removeNode(node) {
        if (!node) return;

        node.removed = true;

        const connected = this.struts.filter(strut =>
            strut.a === node || strut.b === node
        );

        for (const strut of connected) {
            this.removeStrut(strut, false);
        }

        this.mines = this.mines.filter(
            mine => mine.node !== node
        );

        Matter.Composite.remove(Physics.world, node.body);

        const index = this.nodes.indexOf(node);

        if (index !== -1) {
            this.nodes.splice(index, 1);
        }

        this.checkSupport();
    },

    deleteAt(x, y) {
        const node = this.getNearestNode(x, y, 18);

        if (node && !node.isFoundation && !node.isCore) {
            this.removeNode(node);
            return true;
        }

        let closest = null;
        let bestDistance = 15;

        for (const strut of this.struts) {
            const distance = this.pointToSegmentDistance(
                x,
                y,
                strut.a.body.position,
                strut.b.body.position
            );

            if (distance < bestDistance) {
                bestDistance = distance;
                closest = strut;
            }
        }

        if (closest) {
            this.removeStrut(closest);
            return true;
        }

        return false;
    },

    pointToSegmentDistance(px, py, a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lengthSquared = dx * dx + dy * dy;

        if (!lengthSquared) {
            return Math.hypot(px - a.x, py - a.y);
        }

        let t = (
            (px - a.x) * dx +
            (py - a.y) * dy
        ) / lengthSquared;

        t = Math.max(0, Math.min(1, t));

        return Math.hypot(
            px - (a.x + t * dx),
            py - (a.y + t * dy)
        );
    },

    damageNode(body, damage = 35) {
        const node = this.nodes.find(item => item.body === body);

        if (!node) return;

        node.health -= damage;

        if (node.health <= 0) {
            this.removeNode(node);
        }

        this.updateHUD();
    },

    damageStrut(body, damage = 35) {
        const strut = this.struts.find(item => item.body === body);

        if (!strut) return;

        strut.health -= damage;

        if (strut.health <= 0) {
            this.removeStrut(strut);
        }
    },

    destroyTeam(team) {
        const nodes = this.nodes.filter(
            node => node.team === team
        );

        for (const node of nodes) {
            this.removeNode(node);
        }
    },

    generateResources() {
        const activeMines = this.mines.filter(mine =>
            this.nodes.includes(mine.node) &&
            this.isGroundConnected(mine.node)
        );

        this.resources.energy += activeMines.length *
            (CONFIG.ENERGY_GENERATION || 1);

        this.updateHUD();
    },

    update(delta = 16.667) {
        this.mines = this.mines.filter(mine =>
            this.nodes.includes(mine.node)
        );

        for (const strut of [...this.struts]) {
            if (
                !this.nodes.includes(strut.a) ||
                !this.nodes.includes(strut.b)
            ) {
                this.removeStrut(strut, false);
                continue;
            }

            const a = strut.a.body.position;
            const b = strut.b.body.position;

            const length = this.distance(a, b);

            if (length > strut.length * strut.breakRatio) {
                this.removeStrut(strut);
                continue;
            }

            const centerX = (a.x + b.x) / 2;
            const centerY = (a.y + b.y) / 2;
            const angle = Math.atan2(b.y - a.y, b.x - a.x);

            Matter.Body.setPosition(strut.body, {
                x: centerX,
                y: centerY
            });

            Matter.Body.setAngle(strut.body, angle);
        }
    },

    updateHUD() {
        const metalElement = document.getElementById("metal-count");
        const energyElement = document.getElementById("energy-count");

        if (metalElement) {
            metalElement.textContent = Math.floor(this.resources.metal);
        }

        if (energyElement) {
            energyElement.textContent = Math.floor(this.resources.energy);
        }
    },

    draw(ctx) {
        if (!ctx) return;

        this.drawGrid(ctx);

        for (const strut of this.struts) {
            const a = strut.a.body.position;
            const b = strut.b.body.position;
            const material = this.settings(strut.material);

            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.lineWidth = strut.width;
            ctx.strokeStyle = material.dark;
            ctx.lineCap = "round";
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.lineWidth = Math.max(2, strut.width - 3);
            ctx.strokeStyle = material.color;
            ctx.stroke();
        }

        for (const node of this.nodes) {
            const p = node.body.position;

            ctx.beginPath();
            ctx.arc(
                p.x,
                p.y,
                node.isCore ? this.coreRadius : this.nodeRadius,
                0,
                Math.PI * 2
            );

            ctx.fillStyle = node.isCore
                ? "#26eaff"
                : node.team === "player"
                    ? "#dceaff"
                    : "#ff7777";

            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#263746";
            ctx.stroke();
        }

        for (const mine of this.mines) {
            const p = mine.node.body.position;

            ctx.fillStyle = "#32ff9c";
            ctx.beginPath();
            ctx.arc(p.x, p.y - 15, 7, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = "#174d38";
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        this.drawPreview(ctx);
    },

    drawGrid(ctx) {
        if (!this.gridEnabled) return;

        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 1;

        const cameraOffset = Math.max(
            0,
            (Physics.worldWidth - window.innerWidth) / 2
        );

        const startX = Math.floor(
            cameraOffset / this.gridSize
        ) * this.gridSize;

        for (
            let x = startX;
            x < cameraOffset + ctx.canvas.width;
            x += this.gridSize
        ) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, ctx.canvas.height);
            ctx.stroke();
        }

        for (
            let y = 0;
            y < ctx.canvas.height;
            y += this.gridSize
        ) {
            ctx.beginPath();
            ctx.moveTo(cameraOffset, y);
            ctx.lineTo(cameraOffset + ctx.canvas.width, y);
            ctx.stroke();
        }

        ctx.restore();
    },

    drawPreview(ctx) {
        if (!this.drag) return;

        const start = this.drag.startNode.body.position;
        const end = this.snapPoint(this.drag.x, this.drag.y);
        const material = this.settings(this.material);

        ctx.save();

        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.strokeStyle = material.color;
        ctx.lineWidth = material.width;
        ctx.setLineDash([8, 6]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(end.x, end.y, this.nodeRadius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fill();

        ctx.restore();
    }
};