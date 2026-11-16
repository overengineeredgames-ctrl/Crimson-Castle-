
"use strict";

const Building = {
    nodes: [],
    struts: [],
    mines: [],
    drag: null,

    repairMode: false,
    repairTarget: null,
    repairMouse: { x: 0, y: 0 },
    repairRate: 45,

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

    canPlaceNode(x, y, team = "player") {
        // Keep player construction clear of enemy cannon bodies and barrels.
        if (team === "player" && typeof Weapons !== "undefined") {
            for (const cannon of Weapons.cannons || []) {
                if (
                    cannon.team !== "enemy" ||
                    !cannon.node ||
                    cannon.node.removed
                ) continue;

                const p = cannon.node.body.position;
                // Cannon footprint plus roughly 5 cm of extra clearance.
                if (Math.hypot(x - p.x, y - p.y) < 42) return false;
            }
        }

        return true;
    },

    createNode(x, y, options = {}) {
        const team = options.team || "player";
        if (!this.canPlaceNode(x, y, team)) return null;

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

    segmentsIntersect(a1, a2, b1, b2) {
        const orient = (p, q, r) =>
            (q.x - p.x) * (r.y - p.y) -
            (q.y - p.y) * (r.x - p.x);
        const onSegment = (p, q, r) =>
            q.x >= Math.min(p.x, r.x) - 0.001 &&
            q.x <= Math.max(p.x, r.x) + 0.001 &&
            q.y >= Math.min(p.y, r.y) - 0.001 &&
            q.y <= Math.max(p.y, r.y) + 0.001;

        const o1 = orient(a1, a2, b1);
        const o2 = orient(a1, a2, b2);
        const o3 = orient(b1, b2, a1);
        const o4 = orient(b1, b2, a2);

        if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) &&
            ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;

        return (Math.abs(o1) < 0.001 && onSegment(a1, b1, a2)) ||
            (Math.abs(o2) < 0.001 && onSegment(a1, b2, a2)) ||
            (Math.abs(o3) < 0.001 && onSegment(b1, a1, b2)) ||
            (Math.abs(o4) < 0.001 && onSegment(b1, a2, b2));
    },

    canPlaceStrut(nodeA, nodeB, width = 7) {
        const a = nodeA.body.position;
        const b = nodeB.body.position;

        // Do not allow a player beam to pass through an enemy cannon.
        // The 42px cannon footprint includes approximately 5cm grace.
        if (nodeA.team === "player" && typeof Weapons !== "undefined") {
            for (const cannon of Weapons.cannons || []) {
                if (
                    cannon.team !== "enemy" ||
                    !cannon.node ||
                    cannon.node.removed
                ) continue;

                const p = cannon.node.body.position;
                const clearance = 42 + width / 2;
                if (this.pointToSegmentDistance(p.x, p.y, a, b) < clearance) {
                    return false;
                }
            }
        }

        // Opposing beams may touch neither beams nor joints.
        for (const other of this.struts) {
            if (other.team === nodeA.team || !other.a || !other.b) continue;

            const c = other.a.body.position;
            const d = other.b.body.position;
            const clearance = (width + other.width) / 2 + 3;

            if (this.segmentsIntersect(a, b, c, d) ||
                this.pointToSegmentDistance(a.x, a.y, c, d) < clearance ||
                this.pointToSegmentDistance(b.x, b.y, c, d) < clearance ||
                this.pointToSegmentDistance(c.x, c.y, a, b) < clearance ||
                this.pointToSegmentDistance(d.x, d.y, a, b) < clearance) {
                return false;
            }
        }

        for (const node of this.nodes) {
            if (node.team === nodeA.team || node.removed ||
                node === nodeA || node === nodeB) continue;

            if (this.pointToSegmentDistance(
                node.body.position.x,
                node.body.position.y,
                a, b
            ) < this.nodeRadius + width / 2 + 3) return false;
        }

        return true;
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

        if (!this.canPlaceStrut(nodeA, nodeB, material.width)) {
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
                // Solid beam body: blocks both player and AI structures.
                isStatic: true,
                isSensor: false,
                friction: 0.8,
                frictionStatic: 1,
                restitution: 0,
                angle: Math.atan2(b.y - a.y, b.x - a.x),
                label: "fort-beam"
            }
        );

        beamBody.isFortBeam = true;
        beamBody.team = nodeA.team;
        beamBody.fortLength = length;

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

    createStartingFort() {
        const cameraOffset = Math.max(
            0,
            (Physics.worldWidth - window.innerWidth) / 2
        );

        const leftX = cameraOffset + 100;
        const rightX = leftX + 160;
        const baseY = this.groundY - this.nodeRadius;

        const bottomLeft = this.createNode(leftX, baseY, {
            isFoundation: true
        });

        const bottomRight = this.createNode(rightX, baseY, {
            isFoundation: true
        });

        const topLeft = this.createNode(leftX, baseY - 140);
        const topRight = this.createNode(rightX, baseY - 140);

        const core = this.createCore(
            leftX + 80,
            baseY - 90
        );

        this.createStrut(bottomLeft, bottomRight);
        this.createStrut(bottomLeft, topLeft);
        this.createStrut(bottomRight, topRight);
        this.createStrut(topLeft, topRight);

        this.createStrut(bottomLeft, topRight);
        this.createStrut(bottomRight, topLeft);

        this.createStrut(topLeft, core);
        this.createStrut(topRight, core);

        this.checkSupport();
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

    getStrutAtPoint(x, y, maxDistance = 26) {
        let closest = null;
        let bestDistance = maxDistance;

        for (const strut of this.struts) {
            if (
                strut.team !== "player" ||
                !strut.a || !strut.b ||
                strut.a.removed || strut.b.removed
            ) continue;

            const distance = this.pointToSegmentDistance(
                x, y,
                strut.a.body.position,
                strut.b.body.position
            );

            if (distance < bestDistance) {
                bestDistance = distance;
                closest = strut;
            }
        }

        return closest;
    },

    startDrag(x, y, mode = "beam") {
        const node = this.getNearestNode(x, y, 10);

        // Joints take priority near beam endpoints; beam middles extrude boxes.
        if (!node) {
            const selectedStrut = this.getStrutAtPoint(x, y);

            if (selectedStrut) {
                this.drag = {
                    sourceStrut: selectedStrut,
                    x,
                    y,
                    mode: "extrude"
                };
                return true;
            }
        }

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

        if (drag.sourceStrut) {
            return this.finishStrutExtrusion(drag.sourceStrut, x, y);
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

    finishStrutExtrusion(sourceStrut, x, y) {
        if (
            !sourceStrut ||
            !this.struts.includes(sourceStrut) ||
            sourceStrut.team !== "player"
        ) return false;

        const material = this.settings(this.material);
        const a = sourceStrut.a.body.position;
        const b = sourceStrut.b.body.position;
        const sourceMid = {
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2
        };
        const targetMid = this.snapPoint(x, y);
        const offset = {
            x: targetMid.x - sourceMid.x,
            y: targetMid.y - sourceMid.y
        };

        if (Math.hypot(offset.x, offset.y) < 20) return false;

        const newA = { x: a.x + offset.x, y: a.y + offset.y };
        const newB = { x: b.x + offset.x, y: b.y + offset.y };

        // Both side beams, the far beam, and the two X braces must fit.
        const lengths = [
            this.distance(a, newA),
            this.distance(b, newB),
            this.distance(newA, newB)
        ];

        if (lengths.some(length =>
            length < 5 || length > material.maxLength
        )) return false;

        const cost = material.cost * 7;
        if (!this.charge(cost)) return false;

        const nodeA = this.createNode(newA.x, newA.y, { team: sourceStrut.team });
        const nodeB = this.createNode(newB.x, newB.y, { team: sourceStrut.team });
        const center = this.createNode(
            (a.x + b.x + newA.x + newB.x) / 4,
            (a.y + b.y + newA.y + newB.y) / 4,
            { team: sourceStrut.team }
        );

        // Split the X at its crossing so every brace stays within beam length limits.
        const created = [
            this.createStrut(sourceStrut.a, nodeA),
            this.createStrut(sourceStrut.b, nodeB),
            this.createStrut(nodeA, nodeB),
            this.createStrut(sourceStrut.a, center),
            this.createStrut(center, nodeB),
            this.createStrut(sourceStrut.b, center),
            this.createStrut(center, nodeA)
        ];

        if (created.some(strut => !strut)) {
            this.removeNode(nodeA);
            this.removeNode(nodeB);
            this.removeNode(center);
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
        // Player deletion is intentionally limited to player-owned structures.
        // Enemy AI nodes, beams, and cannons must never be removable by the player.
        let closestNode = null;
        let nodeDistance = 18;

        for (const node of this.nodes) {
            if (
                node.removed ||
                node.team !== "player" ||
                node.isFoundation ||
                node.isCore
            ) continue;

            const distance = Math.hypot(
                node.body.position.x - x,
                node.body.position.y - y
            );

            if (distance < nodeDistance) {
                nodeDistance = distance;
                closestNode = node;
            }
        }

        if (closestNode) {
            this.removeNode(closestNode);
            return true;
        }

        let closest = null;
        let bestDistance = 15;

        for (const strut of this.struts) {
            if (strut.team !== "player") continue;

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
        node.damageFlash = 180;

        if (node.health <= 0) {
            this.removeNode(node);
        }

        this.updateHUD();
    },

    damageStrut(body, damage = 35) {
        const strut = this.struts.find(item => item.body === body);

        if (!strut) return;

        strut.health -= damage;
        strut.damageFlash = 180;

        if (strut.health <= 0) {
            this.removeStrut(strut);
        }
    },

    setRepairMode(enabled, difficulty = "normal") {
        this.repairMode = !!enabled;
        this.repairTarget = null;

        const rates = {
            easy: 100,
            normal: 50,
            hard: 22
        };
        this.repairRate = rates[difficulty] || rates.normal;
    },

    startRepairAt(x, y, difficulty = "normal") {
        this.repairMouse.x = x;
        this.repairMouse.y = y;

        if (!this.repairMode) return false;

        // The repair cursor is a 60px-wide (roughly one-inch) targeting circle.
        const radius = 30;
        let target = null;
        let bestDistance = radius;

        for (const strut of this.struts) {
            if (
                strut.team !== "player" ||
                !strut.a || !strut.b ||
                strut.a.removed || strut.b.removed ||
                strut.health >= strut.maxHealth
            ) continue;

            const distance = this.pointToSegmentDistance(
                x, y,
                strut.a.body.position,
                strut.b.body.position
            );

            if (distance <= bestDistance) {
                bestDistance = distance;
                target = strut;
            }
        }

        if (!target) {
            this.repairTarget = null;
            return true;
        }

        this.setRepairMode(true, difficulty);
        this.repairTarget = target;
        return true;
    },

    updateRepair(delta = 16.667) {
        const target = this.repairTarget;
        if (!this.repairMode || !target) return;

        if (
            !this.struts.includes(target) ||
            target.team !== "player" ||
            !target.a || !target.b ||
            target.a.removed || target.b.removed
        ) {
            this.repairTarget = null;
            return;
        }

        target.health = Math.min(
            target.maxHealth,
            target.health + this.repairRate * (delta / 1000)
        );

        if (target.health >= target.maxHealth) {
            target.health = target.maxHealth;
            this.repairTarget = null;
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
        this.updateRepair(delta);

        this.mines = this.mines.filter(mine =>
            this.nodes.includes(mine.node)
        );

        for (const node of this.nodes) {
            node.damageFlash = Math.max(0, (node.damageFlash || 0) - delta);
        }

        for (const strut of [...this.struts]) {
            strut.damageFlash = Math.max(0, (strut.damageFlash || 0) - delta);

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

            // Keep the solid collision rectangle aligned and sized to its
            // endpoints as the structure moves under physics.
            if (strut.body.fortLength && Math.abs(length - strut.body.fortLength) > 0.5) {
                const scale = length / strut.body.fortLength;
                Matter.Body.scale(strut.body, scale, 1);
                strut.body.fortLength = length;
            }

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
            const healthRatio = Math.max(0, strut.health / strut.maxHealth);
            const damage = 1 - healthRatio;

            // Damaged beams visibly char and redden as soon as they are hit.
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.lineWidth = strut.width + (damage > 0.05 ? 1.5 : 0);
            ctx.strokeStyle = damage > 0.05
                ? (damage > 0.65 ? "#321c1c" : "#63352f")
                : material.dark;
            ctx.lineCap = "round";
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.lineWidth = Math.max(2, strut.width - 3);
            ctx.strokeStyle = damage > 0.65
                ? "#a33e38"
                : damage > 0.2
                    ? "#c16a50"
                    : material.color;
            ctx.stroke();

            // A red damage seam makes enemy and player beam damage easy to spot.
            if (damage > 0.05) {
                ctx.save();
                ctx.globalAlpha = Math.min(0.9, 0.25 + damage * 0.75);
                ctx.strokeStyle = "#ff493d";
                ctx.lineWidth = Math.max(1.5, strut.width * 0.24);
                ctx.setLineDash([5, 4]);
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
            }

            // Cracks become more visible as a beam loses health.
            if (damage > 0.2) {
                const midX = (a.x + b.x) / 2;
                const midY = (a.y + b.y) / 2;
                const angle = Math.atan2(b.y - a.y, b.x - a.x);
                const nx = -Math.sin(angle);
                const ny = Math.cos(angle);

                ctx.save();
                ctx.translate(midX, midY);
                ctx.strokeStyle = strut.damageFlash > 0 ? "#fff1c2" : "#241d1a";
                ctx.lineWidth = 1.7;
                ctx.beginPath();
                ctx.moveTo(-nx * 3, -ny * 3);
                ctx.lineTo(-nx * 1, -ny * 1);
                ctx.lineTo(nx * 2, ny * 2);
                ctx.lineTo(nx * 1, ny * 5);
                ctx.stroke();
                if (damage > 0.55) {
                    ctx.beginPath();
                    ctx.moveTo(nx * 2, ny * 2);
                    ctx.lineTo(nx * 5 + 3, ny * 5);
                    ctx.stroke();
                }
                ctx.restore();
            }

            if (strut.damageFlash > 0) {
                ctx.save();
                ctx.globalAlpha = Math.min(0.75, strut.damageFlash / 240);
                ctx.strokeStyle = "#fff0b0";
                ctx.lineWidth = strut.width + 3;
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
                ctx.restore();
            }
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

            const healthRatio = Math.max(0, node.health / node.maxHealth);
            if (!node.isCore && healthRatio < 0.75) {
                ctx.save();
                ctx.globalAlpha = Math.min(0.65, (1 - healthRatio) * 0.9);
                ctx.fillStyle = "#392b28";
                ctx.beginPath();
                ctx.arc(p.x, p.y, this.nodeRadius * 0.72, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = "#1d1715";
                ctx.lineWidth = 1.4;
                ctx.beginPath();
                ctx.moveTo(p.x - 3, p.y - 3);
                ctx.lineTo(p.x, p.y);
                ctx.lineTo(p.x - 1, p.y + 3);
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x + 4, p.y + 2);
                ctx.stroke();
                ctx.restore();
            }

            if (node.damageFlash > 0) {
                ctx.save();
                ctx.globalAlpha = Math.min(0.8, node.damageFlash / 220);
                ctx.fillStyle = "#fff2bd";
                ctx.beginPath();
                ctx.arc(p.x, p.y, node.isCore ? this.coreRadius + 3 : this.nodeRadius + 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            ctx.lineWidth = 2;
            ctx.strokeStyle = node.isCore ? "#a7f5ff" : "#263746";
            ctx.stroke();

            if (node.isCore) {
                // Restore the classic glowing red reactor/core center.
                const coreHealth = Math.max(0, node.health / node.maxHealth);
                ctx.save();
                ctx.beginPath();
                ctx.arc(p.x, p.y, this.coreRadius * 0.62, 0, Math.PI * 2);
                ctx.fillStyle = coreHealth > 0.3 ? "#e73535" : "#8f2020";
                ctx.shadowColor = "#ff2929";
                ctx.shadowBlur = 12;
                ctx.fill();
                ctx.shadowBlur = 0;
                ctx.lineWidth = 2;
                ctx.strokeStyle = "#ff9b8e";
                ctx.stroke();

                // Small bright reactor slit gives the core a hot, powered center.
                ctx.beginPath();
                ctx.arc(p.x, p.y, this.coreRadius * 0.22, 0, Math.PI * 2);
                ctx.fillStyle = "#ffb2a6";
                ctx.fill();
                ctx.restore();

                this.drawCoreHealthBar(ctx, node);
            }
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

        if (this.repairMode) {
            const radius = 30;
            const target = this.repairTarget;
            ctx.save();
            ctx.beginPath();
            ctx.arc(this.repairMouse.x, this.repairMouse.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(70, 235, 130, 0.10)";
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = target ? "#65ff9a" : "rgba(110,255,160,0.85)";
            ctx.stroke();

            if (target && this.struts.includes(target)) {
                const a = target.a.body.position;
                const b = target.b.body.position;
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.lineWidth = target.width + 5;
                ctx.strokeStyle = "rgba(80,255,130,0.7)";
                ctx.stroke();
            }
            ctx.restore();
        }
    },

    drawCoreHealthBar(ctx, node) {
        const p = node.body.position;
        const width = 76;
        const height = 8;
        const ratio = Math.max(0, Math.min(1, node.health / node.maxHealth));
        const x = p.x - width / 2;
        const y = p.y - this.coreRadius - 19;
        const color = ratio > 0.6 ? "#42d66b" : ratio > 0.3 ? "#f0c34e" : "#ed554f";

        ctx.save();
        ctx.fillStyle = "rgba(10,16,25,0.9)";
        ctx.fillRect(x - 2, y - 13, width + 4, height + 17);
        ctx.font = "bold 9px Arial";
        ctx.textAlign = "center";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(node.team === "player" ? "YOUR CORE" : "ENEMY CORE", p.x, y - 4);
        ctx.fillStyle = "#303943";
        ctx.fillRect(x, y, width, height);
        ctx.fillStyle = color;
        ctx.fillRect(x, y, width * ratio, height);
        ctx.strokeStyle = "#d7e2eb";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, width, height);
        ctx.restore();
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

        const material = this.settings(this.material);
        ctx.save();
        ctx.strokeStyle = material.color;
        ctx.lineWidth = material.width;
        ctx.setLineDash([8, 6]);

        if (this.drag.sourceStrut) {
            const a = this.drag.sourceStrut.a.body.position;
            const b = this.drag.sourceStrut.b.body.position;
            const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            const target = this.snapPoint(this.drag.x, this.drag.y);
            const dx = target.x - midpoint.x;
            const dy = target.y - midpoint.y;
            const newA = { x: a.x + dx, y: a.y + dy };
            const newB = { x: b.x + dx, y: b.y + dy };

            // Preview the new box and its X-shaped internal bracing.
            const lines = [
                [a, newA], [b, newB], [newA, newB],
                [a, newB], [b, newA]
            ];

            for (const [start, end] of lines) {
                ctx.beginPath();
                ctx.moveTo(start.x, start.y);
                ctx.lineTo(end.x, end.y);
                ctx.stroke();
            }

            ctx.setLineDash([]);
            ctx.fillStyle = "rgba(255,255,255,0.55)";
            for (const point of [newA, newB]) {
                ctx.beginPath();
                ctx.arc(point.x, point.y, this.nodeRadius, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (this.drag.startNode) {
            const start = this.drag.startNode.body.position;
            const end = this.snapPoint(this.drag.x, this.drag.y);

            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();

            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(end.x, end.y, this.nodeRadius, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255,255,255,0.5)";
            ctx.fill();
        }

        ctx.restore();
    }
};