
"use strict";

var Building = window.Building = {
    nodes: [],
    struts: [],
    mines: [],
    debris: [],
    installations: [],
    utilityTool: null,
    drag: null,
    doorMaterial: null,

    repairMode: false,
    deleteMode: false,
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
        wood: 250,
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
        this.debris = [];
        this.installations = [];
        this.utilityTool = null;
        this.drag = null;
        this.doorMaterial = null;
        this.doorModifierDrag = null;
        this.doorConfirmTimer = null;

        this.resources = {
            metal: CONFIG.STARTING_METAL || 500,
            wood: 250,
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

    // Create invisible, team-specific anchor joints along the floor only
    // when construction needs one. This keeps the floor aligned without
    // filling the physics world with thousands of unused bodies.
    getGroundAnchor(x, team = "player") {
        const anchorX = this.snap(x);
        const anchorY = Physics.terrainYAt(anchorX) - this.nodeRadius;
        const existing = this.nodes.find(node =>
            !node.removed &&
            node.isGroundJoint &&
            node.isFoundation &&
            node.team === team &&
            Math.abs(node.body.position.x - anchorX) < 1
        );
        if (existing) return existing;

        return this.createNode(anchorX, anchorY, {
            team,
            isFoundation: true,
            isGroundJoint: true,
            hidden: false
        });
    },

    snapPointToGround(point, team = "player", threshold = 85) {
        const groundNodeY = Physics.terrainYAt(point.x) - this.nodeRadius;

        // Snap the joint center to the floor-node row when the player builds
        // reasonably close to the ground. A wider tolerance makes this work
        // even when the grid places the dragged endpoint a little too high.
        if (Math.abs(point.y - groundNodeY) > threshold) return null;

        const anchor = this.getGroundAnchor(point.x, team);
        return anchor || null;
    },

    getBuildEndpoint(x, y, team = "player") {
        const snapped = this.snapPoint(x, y);
        const groundAnchor = this.snapPointToGround(snapped, team);
        return groundAnchor
            ? { x: groundAnchor.body.position.x, y: groundAnchor.body.position.y, node: groundAnchor }
            : { x: snapped.x, y: snapped.y, node: null };
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
            if (node.removed || node.hidden) continue;

            const d = this.distance(node.body.position, { x, y });

            if (d < bestDistance) {
                bestDistance = d;
                nearest = node;
            }
        }

        return nearest;
    },

    canPlaceNode(x, y, team = "player") {
        if (team !== "player") return true;

        const point = { x, y };
        const nodeClearance = this.nodeRadius * 2 + 5;

        // Never allow a new player joint to be placed inside an enemy joint.
        for (const node of this.nodes) {
            if (node.team !== "enemy" || node.removed || node.hidden) continue;

            if (this.distance(point, node.body.position) < nodeClearance) {
                return false;
            }
        }

        // Keep player joints out of enemy beams as well. Without this check,
        // a player could start a new beam from a joint placed directly on an
        // enemy beam, making the two forts visually overlap.
        for (const strut of this.struts) {
            if (
                strut.team !== "enemy" ||
                strut.removed ||
                !strut.a ||
                !strut.b ||
                strut.a.removed ||
                strut.b.removed
            ) continue;

            if (this.pointToSegmentDistance(
                x,
                y,
                strut.a.body.position,
                strut.b.body.position
            ) < this.nodeRadius + strut.width / 2 + 6) {
                return false;
            }
        }

        // Keep player construction clear of enemy cannon bodies and barrels.
        if (typeof Weapons !== "undefined") {
            for (const cannon of Weapons.cannons || []) {
                if (
                    cannon.team !== "enemy" ||
                    !cannon.node ||
                    cannon.node.removed
                ) continue;

                const p = cannon.node.body.position;
                if (Math.hypot(x - p.x, y - p.y) < 46) return false;
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

                // Connected joints in one fortress must not collide with
                // each other: those contacts fight the beam constraints and
                // can pull a structure into a compressed, unstable shape.
                // Different teams use different groups, so enemy structures
                // can still collide with one another.
                // Structural joints are never physically colliding.
                // Their constraints provide the fort's structural behavior;
                // avoiding joint contacts prevents self-collision impulses.
                collisionFilter: {
                    category: team === "enemy" ? 0x0004 : 0x0002,
                    mask: 0x0001,
                    group: 0
                },

                label: isCore ? "fort-core" : "fort-node"
            }
        );

        body.isFortNode = true;

        const node = {
            body,
            team: options.team || "player",
            material: materialName,
            isFoundation,
            isBaseAnchor: !!options.isBaseAnchor,
            isGroundJoint: !!options.isGroundJoint,
            isCore,
            hidden: !!options.hidden,
            canHoldMine: !isCore &&
                Math.abs(y + (isCore ? this.coreRadius : this.nodeRadius) - Physics.terrainYAt(x)) <= 8,
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

        const isDoor = !!options.isDoor;
        const initialAngle = Math.atan2(b.y - a.y, b.x - a.x);
        // The beam's endpoint constraint always keeps the fort structurally
        // connected. A door panel is a kinematic sensor: it follows the hinge
        // animation but never applies physics forces to the nodes or box.
        const beamBody = Matter.Bodies.rectangle(
            (a.x + b.x) / 2,
            (a.y + b.y) / 2,
            length,
            material.width,
            {
                isStatic: true,
                isSensor: true,
                restitution: 0,
                slop: 0.01,
                collisionFilter: {
                    category: nodeA.team === "enemy" ? 0x0008 : 0x0004,
                    // Only projectile contacts are relevant for a door panel.
                    mask: 0x0001,
                    group: 0
                },
                angle: initialAngle,
                label: isDoor ? "fort-door-panel" : "fort-beam"
            }
        );

        // Keep the same endpoint-to-endpoint structural constraint used by
        // ordinary beams. The visible door panel can swing independently,
        // while the frame nodes remain firmly connected and cannot be yanked.
        const constraint = Matter.Constraint.create({
            bodyA: nodeA.body,
            bodyB: nodeB.body,
            length,
            stiffness: material.stiffness,
            damping: 0.15,
            render: { visible: false }
        });

        beamBody.isFortBeam = true;
        beamBody.team = nodeA.team;
        beamBody.fortLength = length;
        if (isDoor) {
            beamBody.isFortDoor = true;
            beamBody.fortStrut = null;
        }

        const strut = {
            a: nodeA,
            b: nodeB,
            constraint,
            body: beamBody,
            hingeAngle: initialAngle,
            doorLength: isDoor ? length : 0,
            material: materialName,
            length,
            health: material.maxHealth,
            maxHealth: material.maxHealth,
            width: material.width,
            breakRatio: material.breakRatio,
            team: nodeA.team,
            isDoor, doorOpen: false, doorOpenAmount: 0, doorCollisionOpen: false
        };
        if (isDoor) { strut.maxHealth = Math.round(material.maxHealth * 0.72); strut.health = strut.maxHealth; beamBody.isFortDoor = true; }

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
        const baseY = Physics.terrainYAt(leftX) - this.nodeRadius;

        const bottomLeft = this.createNode(leftX, baseY, {
            isFoundation: true,
            isBaseAnchor: true
        });

        const bottomRight = this.createNode(rightX, baseY, {
            isFoundation: true,
            isBaseAnchor: true
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

    // Trace a joint's connections backwards through every beam endpoint.
    // A piece is supported only if this reverse path reaches an original
    // prebuilt base anchor (or a visible foundation), not merely a hidden
    // construction snap-point created later.
    traceJointPathToBase(startNode, adjacency) {
        if (!startNode || startNode.removed) return [];

        const queue = [startNode];
        const previous = new Map([[startNode, null]]);
        let baseNode = null;

        while (queue.length) {
            const current = queue.shift();

            if (current.isBaseAnchor || (current.isFoundation && !current.hidden)) {
                baseNode = current;
                break;
            }

            for (const next of adjacency.get(current) || []) {
                if (!next || next.removed || previous.has(next)) continue;
                previous.set(next, current);
                queue.push(next);
            }
        }

        if (!baseNode) return [];

        const path = [];
        let cursor = baseNode;
        while (cursor) {
            path.push(cursor);
            cursor = previous.get(cursor) || null;
        }
        return path;
    },

    checkSupport() {
        const teams = [...new Set(this.nodes.map(node => node.team))];

        for (const team of teams) {
            // Build a two-way joint map. A beam connects A to B and B to A;
            // tracing from a loose piece therefore works in either direction.
            const adjacency = new Map();
            for (const node of this.nodes) {
                if (node.team === team && !node.removed) adjacency.set(node, []);
            }

            for (const beam of this.struts) {
                if (
                    beam.team !== team ||
                    !beam.a || !beam.b ||
                    beam.a.removed || beam.b.removed
                ) continue;

                if (!adjacency.has(beam.a)) adjacency.set(beam.a, []);
                if (!adjacency.has(beam.b)) adjacency.set(beam.b, []);
                adjacency.get(beam.a).push(beam.b);
                adjacency.get(beam.b).push(beam.a);
            }

            // Reverse-search from every joint. If its beam/joint path can
            // reach a prebuilt base anchor, it belongs to the supported fort.
            const supported = new Set();
            for (const node of adjacency.keys()) {
                if (this.traceJointPathToBase(node, adjacency).length) {
                    supported.add(node);
                }
            }

            for (const node of this.nodes) {
                if (node.team !== team || node.removed) continue;
                node.supported = supported.has(node);

                if (
                    !node.supported &&
                    node.body.isStatic &&
                    !node.isFoundation
                ) {
                    Matter.Body.setStatic(node.body, false);
                }
            }

            // Gather each unsupported, movable section. Hidden ground anchors
            // are fixed world attachment points, not falling debris pieces.
            const detachedVisited = new Set();
            for (const startNode of this.nodes) {
                if (
                    startNode.team !== team ||
                    startNode.removed ||
                    startNode.supported ||
                    startNode.isFoundation ||
                    startNode.debrisGroup ||
                    detachedVisited.has(startNode)
                ) continue;

                const componentNodes = [];
                const queue = [startNode];
                detachedVisited.add(startNode);

                while (queue.length) {
                    const current = queue.shift();
                    componentNodes.push(current);

                    for (const next of adjacency.get(current) || []) {
                        if (
                            next.removed ||
                            next.supported ||
                            next.isFoundation ||
                            next.debrisGroup ||
                            detachedVisited.has(next)
                        ) continue;

                        detachedVisited.add(next);
                        queue.push(next);
                    }
                }

                if (!componentNodes.length) continue;

                const componentSet = new Set(componentNodes);

                // Sever beams from this falling section to fixed hidden
                // anchors. Otherwise their constraints would hold the wreck up.
                const boundaryBeams = this.struts.filter(beam =>
                    beam.team === team &&
                    (componentSet.has(beam.a) !== componentSet.has(beam.b))
                );
                for (const beam of boundaryBeams) {
                    this.removeStrut(beam, false);
                }

                const componentStruts = this.struts.filter(beam =>
                    componentSet.has(beam.a) && componentSet.has(beam.b)
                );

                const group = {
                    nodes: componentNodes,
                    struts: componentStruts,
                    grounded: false,
                    groundedTime: 0,
                    alpha: 1,
                    removed: false
                };

                for (const node of componentNodes) {
                    node.debrisGroup = group;
                    node.detached = true;
                    if (node.body.isStatic) Matter.Body.setStatic(node.body, false);
                }

                for (const beam of componentStruts) beam.debrisGroup = group;

                if (typeof Weapons !== "undefined") {
                    for (const cannon of Weapons.cannons) {
                        if (!componentSet.has(cannon.node)) continue;
                        cannon.detached = true;
                        Weapons.selectedCannons =
                            Weapons.selectedCannons.filter(item => item !== cannon);
                        if (Weapons.selectedCannon === cannon) {
                            Weapons.selectedCannon = null;
                        }
                    }
                }

                this.debris.push(group);
            }
        }
    },

    updateDebris(delta = 16.667) {
        let removedAny = false;

        for (const group of [...this.debris]) {
            if (group.removed) continue;

            // Use Matter's actual collision bounds as well as the node radius.
            // This is more reliable when the physics solver leaves a tiny gap
            // between a falling wreck and the floor.
            const touchingGround = group.nodes.some(node => {
                if (node.removed || !node.body) return false;
                const radius = node.isCore ? this.coreRadius : this.nodeRadius;
                const bottom = node.body.bounds?.max?.y ??
                    (node.body.position.y + radius);
                return bottom >= Physics.terrainYAt(node.body.position.x) - 8;
            });

            if (touchingGround && !group.grounded) {
                group.grounded = true;
                group.groundedTime = 0;
            }
            if (!group.grounded) continue;

            group.groundedTime += delta;

            // Briefly settle, then fade the whole wreck over about 1.2 seconds.
            const fadeProgress = Math.max(0, (group.groundedTime - 350) / 1200);
            group.alpha = Math.max(0, 1 - fadeProgress);

            if (group.groundedTime < 1550) continue;

            group.removed = true;
            for (const node of group.nodes) {
                if (this.nodes.includes(node)) this.removeNode(node, false);
            }
            this.debris = this.debris.filter(item => item !== group);
            removedAny = true;
        }

        if (removedAny) this.checkSupport();
    },

    utilityDefinitions: {
        drill: { name: "Metal Drill", metalCost: 130, energyCost: 0, drillRate: 5.5, powerUse: 3.5 },
        treeMine: { name: "Tree Mine", metalCost: 105, woodRate: 4 },
        windmill: { name: "Windmill", metalCost: 115, energyCost: 0 },
        battery: { name: "Battery", metalCost: 90, energyCost: 0, capacity: 300 }
    },

    createUtilityButtons() {
        const toolbar = document.querySelector(".toolbar");
        if (!toolbar) return;

        const definitions = [
            ["drill", "Metal Drill", "130 metal • ground only • uses power"],
            ["treeMine", "Tree Mine", "105 metal • produces 4 wood/sec"],
            ["windmill", "Windmill", "115 metal • variable power"],
            ["battery", "Battery", "90 metal • +300 storage"]
        ];

        for (const [type, label, detail] of definitions) {
            const id = "btn-" + type;
            let button = document.getElementById(id);
            if (!button) {
                button = document.createElement("button");
                button.id = id;
                button.type = "button";
                button.className = "tool";
                button.dataset.toolCategory = "utilities";
                button.innerHTML = label + "<small>" + detail + "</small>";
                toolbar.appendChild(button);
            }
            button.onclick = () => this.setUtilityTool(
                this.utilityTool === type ? null : type
            );
        }
    },

    setUtilityTool(type) {
        if (type && !this.utilityDefinitions[type]) return;
        this.utilityTool = type;
        this.deleteMode = false;
        this.repairMode = false;
        this.repairTarget = null;
        if (typeof Weapons !== "undefined") {
            if (Weapons.clearSelectedTool) Weapons.clearSelectedTool();
            if (Weapons.clearSelectedCannon) Weapons.clearSelectedCannon();
        }
        this.updateToolbar();
    },

    getEnclosedCells(team = "player") {
        const adjacency = new Map();
        const edgeSet = new Set();
        const addEdge = (a, b) => {
            if (!adjacency.has(a)) adjacency.set(a, new Set());
            adjacency.get(a).add(b);
            edgeSet.add(a.body.id + ":" + b.body.id);
            edgeSet.add(b.body.id + ":" + a.body.id);
        };

        for (const strut of this.struts) {
            if (strut.removed || strut.team !== team ||
                !strut.a || !strut.b || strut.a.removed || strut.b.removed) continue;
            addEdge(strut.a, strut.b);
        }

        const cells = [];
        const seen = new Set();
        for (const [a, neighbors] of adjacency) {
            const list = [...neighbors];
            for (let i = 0; i < list.length; i++) {
                for (let j = i + 1; j < list.length; j++) {
                    const b = list[i];
                    const d = list[j];
                    if (b === d) continue;
                    const shared = [...(adjacency.get(b) || [])].filter(c =>
                        c !== a && c !== d && adjacency.get(d)?.has(c)
                    );
                    for (const c of shared) {
                        const ids = [a, b, c, d].map(n => n.body.id).sort((x,y) => x-y);
                        const key = ids.join("-");
                        if (seen.has(key)) continue;
                        seen.add(key);
                        const nodes = [a, b, c, d];
                        const center = {
                            x: nodes.reduce((sum,n) => sum+n.body.position.x,0)/4,
                            y: nodes.reduce((sum,n) => sum+n.body.position.y,0)/4
                        };
                        nodes.sort((n1,n2) =>
                            Math.atan2(n1.body.position.y-center.y,n1.body.position.x-center.x) -
                            Math.atan2(n2.body.position.y-center.y,n2.body.position.x-center.x)
                        );
                        const area = Math.abs(nodes.reduce((sum,n,k) => {
                            const p=n.body.position, q=nodes[(k+1)%nodes.length].body.position;
                            return sum + p.x*q.y-q.x*p.y;
                        },0))/2;
                        if (area < 900) continue;
                        cells.push({
                            nodes,
                            center,
                            polygon: nodes.map(n => ({x:n.body.position.x,y:n.body.position.y}))
                        });
                    }
                }
            }
        }
        return cells;
    },

    pointInPolygon(point, polygon) {
        let inside = false;
        for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
            const a=polygon[i], b=polygon[j];
            const crosses=((a.y>point.y)!==(b.y>point.y)) &&
                (point.x < (b.x-a.x)*(point.y-a.y)/(b.y-a.y+0.00001)+a.x);
            if (crosses) inside=!inside;
        }
        return inside;
    },

    hasOpenAir(x, y, anchorNodes = []) {
        const anchors = new Set(anchorNodes);
        const clearance = 62;
        for (const node of this.nodes) {
            if (node.removed || node.team !== "player" || anchors.has(node)) continue;
            if (this.distance({x,y}, node.body.position) < clearance) return false;
        }
        for (const strut of this.struts) {
            if (strut.removed || strut.team !== "player") continue;
            // The beam or joint carrying the windmill is allowed to touch its mast.
            if (anchors.has(strut.a) || anchors.has(strut.b)) continue;
            if (this.pointToSegmentDistance(
                x,y,strut.a.body.position,strut.b.body.position
            ) < clearance * 0.72) return false;
        }
        return true;
    },

    handleUtilityPointerDown(x, y) {
        if (!this.utilityTool) return false;
        const type = this.utilityTool;
        const definition = this.utilityDefinitions[type];
        let anchorNodes = [];
        let mountX = x;
        let mountY = y;
        let windmillMountFound = false;

        if (type === "drill") {
            // Metal drills must sit on a genuine ground joint, just like mines.
            const groundJoint = this.nodes
                .filter(node => node.team === "player" && !node.removed &&
                    node.canHoldMine)
                .map(node => ({ node, distance: this.distance(node.body.position, {x,y}) }))
                .filter(item => item.distance <= 38)
                .sort((a,b) => a.distance - b.distance)[0];
            if (!groundJoint) {
                this.showPlacementMessage("Metal Drills can only be placed on a ground joint");
                return true;
            }
            anchorNodes = [groundJoint.node];
            mountX = groundJoint.node.body.position.x;
            mountY = groundJoint.node.body.position.y - 19;
        } else if (type === "treeMine") {
            // Tree mines are indoor installations and must be placed inside a
            // fully enclosed four-joint cell, not on a loose node.
            const cell = this.getEnclosedCells("player").find(item =>
                this.pointInPolygon({x,y}, item.polygon)
            );
            if (!cell) {
                this.showPlacementMessage("Tree Mines must be placed inside an enclosed box");
                return true;
            }
            anchorNodes = cell.nodes;
        } else if (type === "windmill") {
            const nearestNode = this.nodes
                .filter(node => node.team === "player" && !node.removed && !node.isCore)
                .map(node => ({node, distance:this.distance(node.body.position,{x,y})}))
                .filter(item => item.distance <= 48)
                .sort((a,b) => a.distance-b.distance)[0];

            if (nearestNode) {
                anchorNodes = [nearestNode.node];
                mountX = nearestNode.node.body.position.x;
                mountY = nearestNode.node.body.position.y;
                windmillMountFound = true;
            } else {
                const nearestBeam = this.struts
                    .filter(beam => beam.team === "player" && !beam.removed &&
                        beam.a && beam.b && !beam.a.removed && !beam.b.removed)
                    .map(beam => {
                        const a = beam.a.body.position;
                        const b = beam.b.body.position;
                        const dx = b.x-a.x, dy = b.y-a.y;
                        const lengthSquared = dx*dx+dy*dy;
                        const t = lengthSquared ? ((x-a.x)*dx+(y-a.y)*dy)/lengthSquared : 0;
                        const clampedT = Math.max(0,Math.min(1,t));
                        const px=a.x+dx*clampedT, py=a.y+dy*clampedT;
                        return {beam,t,distance:Math.hypot(x-px,y-py)};
                    })
                    .filter(item => item.t>=0.35 && item.t<=0.65 && item.distance<=32)
                    .sort((a,b)=>a.distance-b.distance)[0];
                if (nearestBeam) {
                    anchorNodes=[nearestBeam.beam.a,nearestBeam.beam.b];
                    mountX=(anchorNodes[0].body.position.x+anchorNodes[1].body.position.x)/2;
                    mountY=(anchorNodes[0].body.position.y+anchorNodes[1].body.position.y)/2;
                    windmillMountFound=true;
                }
            }
            if (!anchorNodes.length) {
                this.showPlacementMessage("Place a windmill on a node or near the middle of a beam");
                return true;
            }
            if (!this.hasOpenAir(mountX,mountY-48,anchorNodes)) {
                this.showPlacementMessage("Windmills need clear open air above the mount");
                return true;
            }
        } else {
            const cell = this.getEnclosedCells("player").find(item =>
                this.pointInPolygon({x,y}, item.polygon)
            );
            anchorNodes = cell ? cell.nodes : [];
            if (!anchorNodes.length) {
                const nearest = this.nodes
                    .filter(node => node.team==="player" && !node.removed && !node.isCore)
                    .map(node=>({node,distance:this.distance(node.body.position,{x,y})}))
                    .filter(item=>item.distance<115)
                    .sort((a,b)=>a.distance-b.distance)[0];
                if (nearest) anchorNodes=[nearest.node];
            }
            if (!anchorNodes.length) return true;
        }

        // All utilities occupy physical space. Keep a generous gap so they
        // cannot stack on top of one another inside a box or on the ground.
        const footprint = type === "windmill" ? 42 : 34;
        const overlapping = this.installations.some(item =>
            !item.removed && Math.hypot(item.x-mountX,item.y-mountY) < footprint + 30
        );
        if (overlapping) {
            this.showPlacementMessage("There isn't enough room — utilities cannot overlap");
            return true;
        }

        if (!this.charge(definition.metalCost)) return true;

        const anchorCenter = {
            x: anchorNodes.reduce((sum,node)=>sum+node.body.position.x,0)/anchorNodes.length,
            y: anchorNodes.reduce((sum,node)=>sum+node.body.position.y,0)/anchorNodes.length
        };
        const installX = type === "drill" || type === "windmill" ? mountX : x;
        const installY = type === "drill" || type === "windmill" ? mountY : y;
        this.installations.push({
            type,
            x: installX,
            y: installY,
            offsetX: installX-anchorCenter.x,
            offsetY: installY-anchorCenter.y,
            anchorNodes: [...anchorNodes],
            removed: false,
            angle: 0,
            phase: Math.random()*Math.PI*2,
            windSpeed: 0.5,
            output: 0
        });
        this.utilityTool=null;
        this.updateToolbar();
        this.updateHUD();
        return true;
    },

    showPlacementMessage(message) {
        const element = document.getElementById("placement-message");
        if (!element) return;
        element.textContent = message;
        element.classList.add("visible");
        clearTimeout(this.placementMessageTimer);
        this.placementMessageTimer = setTimeout(() => element.classList.remove("visible"), 1800);
    },

    updateUtilities(delta = 16.667) {
        const seconds = delta / 1000;
        for (const item of [...this.installations]) {
            if (!item.anchorNodes.some(node => node && !node.removed)) {
                item.removed = true;
                this.installations.splice(this.installations.indexOf(item),1);
                continue;
            }
            const liveAnchors = item.anchorNodes.filter(node => node && !node.removed);
            if (liveAnchors.length) {
                const centerX = liveAnchors.reduce((sum,node) => sum + node.body.position.x,0) / liveAnchors.length;
                const centerY = liveAnchors.reduce((sum,node) => sum + node.body.position.y,0) / liveAnchors.length;
                item.x = centerX + item.offsetX;
                item.y = centerY + item.offsetY;
            }
            if (item.type === "windmill") {
                item.phase += seconds * 0.72;
                item.windSpeed = 0.15 + 0.85 * (0.5 + 0.5 * Math.sin(item.phase));
                item.output = 2 + item.windSpeed * 7;
                item.angle += seconds * (1.2 + item.windSpeed * 5.5);
            }
            if (item.type === "drill") {
                item.angle += seconds * 7;
            }
        }
    },

    getEnergyCapacity() {
        return 100 + this.installations.filter(item =>
            !item.removed && item.type === "battery"
        ).length * this.utilityDefinitions.battery.capacity;
    },

    getEnergyProduction() {
        const minePower = this.mines.filter(mine =>
            mine && !mine.removed && mine.node && !mine.node.removed
        ).reduce((sum,mine) => sum + (mine.energyPerSecond || 2),0);
        const windPower = this.installations.filter(item =>
            !item.removed && item.type === "windmill"
        ).reduce((sum,item) => sum + item.output,0);
        return minePower + windPower;
    },

    addMine(node) {
        if (!node || node.team !== "player") return false;
        if (node.isCore || !node.canHoldMine) return false;
        // Mines require actual ground contact; being connected to a
        // foundation somewhere else in the fort is not enough.

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
        const deleteButton = document.getElementById("btn-delete");
        const repairButton = document.getElementById("btn-repair");
        const woodDoorButton = document.getElementById("btn-wood-door");
        const steelDoorButton = document.getElementById("btn-steel-door");
        this.createUtilityButtons();

        if (woodButton) woodButton.onclick = () => this.setMaterial("wood");
        if (steelButton) steelButton.onclick = () => this.setMaterial("steel");
        if (woodDoorButton) woodDoorButton.onclick = () => this.setDoorMaterial("wood");
        if (steelDoorButton) steelDoorButton.onclick = () => this.setDoorMaterial("steel");

        if (steelButton) {
            steelButton.onclick = () => this.setMaterial("steel");
        }

        if (deleteButton) {
            deleteButton.onclick = () => this.setDeleteMode(!this.deleteMode);
        }

        if (repairButton) {
            repairButton.onclick = () => {
                this.setRepairMode(!this.repairMode, Game.difficulty);
                if (typeof Weapons !== "undefined") {
                    Weapons.clearSelectedCannon();
                    Weapons.clearSelectedTool();
                }
            };
        }

        const doorActions = document.getElementById("door-confirm-actions");
        // Keep the controls outside transformed/clipped game layout containers.
        if (doorActions && doorActions.parentElement !== document.body) document.body.appendChild(doorActions);
        const confirmDoorButton = document.getElementById("btn-confirm-door");
        if (confirmDoorButton) confirmDoorButton.onclick = () => this.confirmDoorModifier();
        const cancelDoorButton = document.getElementById("btn-cancel-door");
        if (cancelDoorButton) cancelDoorButton.onclick = () => {
            this.doorModifierDrag = null;
            this.hideDoorConfirm();
            this.showPlacementMessage("Door placement canceled.");
        };
        this.updateToolbar();
    },

    setDoorMaterial(material) {
        if (material !== "wood" && material !== "steel") return;
        // Door mode is a modifier, not a normal wood/steel beam material.
        // Keep the ordinary beam material untouched and make this the sole
        // active construction action.
        this.doorMaterial = material;
        this.utilityTool = null;
        this.repairMode = false;
        this.repairTarget = null;
        this.deleteMode = false;
        this.drag = null;
        this.doorModifierDrag = null;
        this.hideDoorConfirm();
        if (typeof Weapons !== "undefined") {
            Weapons.clearSelectedTool();
            Weapons.clearSelectedCannon();
        }
        this.updateToolbar();
    },

    setMaterial(material) {
        if (material !== "wood" && material !== "steel") return;
        this.doorMaterial = null;
        this.material = material;
        this.utilityTool = null;
        this.repairMode = false;
        this.repairTarget = null;
        if (typeof Weapons !== "undefined") {
            if (Weapons.clearSelectedTool) Weapons.clearSelectedTool();
            if (Weapons.clearSelectedCannon) Weapons.clearSelectedCannon();
        }
        this.setDeleteMode(false);
        this.updateToolbar();
    },

    setDeleteMode(enabled) {
        this.deleteMode = !!enabled;
        if (this.deleteMode) {
            this.doorMaterial = null;
            this.utilityTool = null;
            this.repairMode = false;
            this.repairTarget = null;
            if (typeof Weapons !== "undefined") {
                if (Weapons.clearSelectedTool) Weapons.clearSelectedTool();
                if (Weapons.clearSelectedCannon) Weapons.clearSelectedCannon();
            }
        }
        this.updateToolbar();
    },

    updateToolbar() {
        const woodButton = document.getElementById("btn-wood");
        const steelButton = document.getElementById("btn-steel");
        const deleteButton = document.getElementById("btn-delete");
        const repairButton = document.getElementById("btn-repair");
        const woodDoorButton = document.getElementById("btn-wood-door");
        const steelDoorButton = document.getElementById("btn-steel-door");

        const linking = typeof Weapons !== "undefined" && Weapons.linkMode;
        for (const type of Object.keys(this.utilityDefinitions)) {
            const button = document.getElementById("btn-" + type);
            if (button) button.classList.toggle("active", !linking && this.utilityTool === type);
        }

        if (woodButton) {
            woodButton.classList.toggle("active", !linking && !this.deleteMode && !this.doorMaterial && this.material === "wood");
        }

        if (steelButton) {
            steelButton.classList.toggle("active", !linking && !this.deleteMode && !this.doorMaterial && this.material === "steel");
        }
        if (woodDoorButton) woodDoorButton.classList.toggle("active", !linking && !this.deleteMode && this.doorMaterial === "wood");
        if (steelDoorButton) steelDoorButton.classList.toggle("active", !linking && !this.deleteMode && this.doorMaterial === "steel");

        if (deleteButton) {
            deleteButton.classList.toggle("active", !linking && this.deleteMode);
            deleteButton.setAttribute("aria-pressed", String(!linking && this.deleteMode));
        }

        if (repairButton) {
            repairButton.classList.toggle("active", !linking && this.repairMode);
            repairButton.setAttribute("aria-pressed", String(!linking && this.repairMode));
        }
    },

    canAfford(amount) {
        return this.resources.metal >= amount;
    },

    charge(amount, resource = "metal") {
        const balance = Number(this.resources[resource] || 0);
        if (balance < amount) return false;

        this.resources[resource] = balance - amount;
        this.updateHUD();
        return true;
    },

    buildingResource() {
        return this.material === "wood" ? "wood" : "metal";
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

    startDoorModifier(x, y) {
        if (!this.doorMaterial) return false;
        // Resolve a start joint from endpoints of live player beams.
        // This avoids unrelated/overlapping nodes winning the hit test and
        // gives the uppermost joints the same generous touch target.
        const endpointSet = new Set();
        for (const beam of this.struts) {
            if (beam.team !== "player" || beam.isDoor || beam.removed || !beam.a || !beam.b) continue;
            if (!beam.a.removed) endpointSet.add(beam.a);
            if (!beam.b.removed) endpointSet.add(beam.b);
        }
        let node = null, nodeDistance = 92;
        for (const candidate of endpointSet) {
            const p = candidate.body.position;
            const distance = Math.hypot(p.x - x, p.y - y);
            if (distance < nodeDistance) {
                node = candidate;
                nodeDistance = distance;
            }
        }
        if (!node) {
            this.showPlacementMessage("Touch a joint, then drag along one of its beams.");
            return true;
        }
        const connected = this.struts.filter(s =>
            s.team === "player" && !s.isDoor && !s.removed &&
            (s.a === node || s.b === node) && s.a && s.b &&
            !s.a.removed && !s.b.removed
        );
        if (!connected.length) {
            this.showPlacementMessage("That joint has no beam to modify.");
            return true;
        }
        this.doorModifierDrag = {
            node, connected, candidate: null, x, y,
            startInput: { x, y },
            startNodePosition: { x: node.body.position.x, y: node.body.position.y },
            released: false, confirmReady: false
        };
        this.hideDoorConfirm();
        this.showPlacementMessage("Drag from the joint along the beam, then release.");
        return true;
    },
    moveDoorModifier(x, y) {
        const drag = this.doorModifierDrag;
        if (!drag || drag.released) return;
        drag.x = x;
        drag.y = y;
        let best = 100, candidate = null;
        for (const beam of drag.connected) {
            if (!this.struts.includes(beam) || !beam.a || !beam.b) continue;
            const distance = this.pointToSegmentDistance(x, y, beam.a.body.position, beam.b.body.position);
            if (distance < best) { best = distance; candidate = beam; }
        }
        drag.candidate = candidate;
        if (this.doorConfirmTimer) clearTimeout(this.doorConfirmTimer);
        this.doorConfirmTimer = null;
        const panel = document.getElementById("door-confirm-actions");
        if (panel) {
            panel.hidden = true;
            panel.style.display = "none";
        }
        if (candidate) {
            this.doorConfirmTimer = setTimeout(() => {
                if (this.doorModifierDrag !== drag) return;
                drag.confirmReady = true;
                // The action bar is shown after pointer release, not while
                // the player is still dragging across the beam.
                this.showPlacementMessage("Beam selected. Release to confirm the door.");
            }, 500);
        }
    },
    releaseDoorModifier() {
        const drag = this.doorModifierDrag;
        if (!drag) return false;
        if (drag.released) return true;
        drag.released = true;
        if (this.doorConfirmTimer) clearTimeout(this.doorConfirmTimer);
        this.doorConfirmTimer = null;
        if (!drag.candidate || !this.struts.includes(drag.candidate)) {
            this.showPlacementMessage("Start at a joint and drag directly along a connected beam.");
            this.doorModifierDrag = null;
            this.hideDoorConfirm();
            return true;
        }
        // Release is the definitive confirmation-ready transition. Do not
        // make visibility depend on a timer after Android has ended touch.
        drag.confirmReady = true;
        const panel = document.getElementById("door-confirm-actions");
        if (panel) {
            panel.hidden = false;
            panel.style.display = "flex";
            panel.style.visibility = "visible";
            panel.style.opacity = "1";
        }
        this.showPlacementMessage("Confirm to replace the selected beam with a door.");
        return true;
    },
    hideDoorConfirm() {
        if (this.doorConfirmTimer) clearTimeout(this.doorConfirmTimer);
        this.doorConfirmTimer = null;
        const panel = document.getElementById("door-confirm-actions");
        if (panel) panel.hidden = true;
    },
    confirmDoorModifier() {
        const drag = this.doorModifierDrag, beam = drag && drag.candidate;
        if (!drag || !drag.released || !drag.confirmReady || !beam || !this.struts.includes(beam)) return;
        const materialName = this.doorMaterial, material = this.settings(materialName);
        const resource = materialName === "wood" ? "wood" : "metal";
        if (!this.charge(material.cost, resource)) {
            this.showPlacementMessage("Not enough resources for that door.");
            this.doorModifierDrag = null; this.hideDoorConfirm(); return;
        }
        // Always build the door outward from the joint the player touched.
        // Beam endpoint order (a/b) is an implementation detail and must not
        // reverse the user's drag direction.
        const startNode = drag.node;
        if (beam.a !== startNode && beam.b !== startNode) {
            this.showPlacementMessage("That beam is no longer connected to the starting joint.");
            this.doorModifierDrag = null; this.hideDoorConfirm(); return;
        }
        const endNode = beam.a === startNode ? beam.b : beam.a;
        const p1 = startNode.body.position, p2 = endNode.body.position;
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const lenSq = dx * dx + dy * dy;
        let t = lenSq ? ((drag.x - p1.x) * dx + (drag.y - p1.y) * dy) / lenSq : 0;
        t = Math.max(0.08, Math.min(0.92, t));
        const splitX = p1.x + dx * t, splitY = p1.y + dy * t;
        const splitNode = this.createNode(splitX, splitY, { team: beam.team, material: beam.material });
        if (!splitNode) {
            this.resources[resource] += material.cost; this.updateHUD();
            this.showPlacementMessage("Couldn't create the door split point. Try a clearer spot.");
            this.doorModifierDrag = null; this.hideDoorConfirm(); return;
        }
        this.removeStrut(beam, false);
        const remainder = this.createStrut(splitNode, endNode, { material: beam.material });
        const door = this.createStrut(startNode, splitNode, { material: materialName, isDoor: true });
        if (!door || !remainder) {
            if (door) this.removeStrut(door, false);
            if (remainder) this.removeStrut(remainder, false);
            this.removeNode(splitNode);
            const restored = this.createStrut(beam.a, beam.b, { material: beam.material });
            this.resources[resource] += material.cost; this.updateHUD();
            this.showPlacementMessage(restored ? "Door split failed; original beam restored." : "Door split failed. Please report this.");
        } else {
            this.checkSupport();
            this.showPlacementMessage("Door placed on the selected section; the remaining beam stays intact.");
        }
        this.doorModifierDrag = null; this.hideDoorConfirm();
    },

    startDrag(x, y, mode = "beam") {
        // Prefer the middle of a beam for box extrusion, even when an
        // existing brace/joint happens to sit close to the click.
        const beam = this.getStrutAtPoint(x, y, 30);
        if (beam && beam.team === "player" && beam.a && beam.b) {
            const a = beam.a.body.position;
            const b = beam.b.body.position;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const lengthSquared = dx * dx + dy * dy;
            const t = lengthSquared
                ? ((x - a.x) * dx + (y - a.y) * dy) / lengthSquared
                : 0;
            if (t >= 0.18 && t <= 0.82) {
                this.drag = {
                    sourceStrut: beam,
                    x,
                    y,
                    mode: "extrude"
                };
                return true;
            }
        }

        // Near endpoints, select the joint for ordinary beam building.
        const node = this.getNearestNode(x, y, 14);
        if (!node || node.team !== "player") return false;

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

        // Doors connect existing joints only; never silently turn a door drag
        // into a new beam-and-joint extrusion.
        if (this.doorMaterial) return false;
        return this.finishExtrusion(drag.startNode, x, y);
    },

    finishBeam(nodeA, nodeB) {
        // Doors may only be created by the joint-to-existing-beam modifier
        // flow. Never let them fall through to normal beam construction.
        if (this.doorMaterial) {
            this.showPlacementMessage("Start at a joint and drag along an existing beam to place a door.");
            return false;
        }
        const materialName = this.material;
        const material = this.settings(materialName);

        if (!nodeA || !nodeB || nodeA === nodeB) {
            return false;
        }

        const length = this.distance(
            nodeA.body.position,
            nodeB.body.position
        );

        if (length > material.maxLength) return false;
        const resource = this.buildingResource();
        if (!this.charge(material.cost, resource)) return false;

        const strut = this.createStrut(nodeA, nodeB, { material: materialName });

        if (!strut) {
            this.resources[resource] += material.cost;
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
        const resource = this.buildingResource();
        if (!this.charge(cost, resource)) return false;

        const middle = {
            x: (start.x + end.x) / 2,
            y: (start.y + end.y) / 2 - 35
        };

        const groundNode = this.snapPointToGround(end, startNode.team);
        const newNode = groundNode || this.createNode(end.x, end.y);
        const diagonalNode = this.createNode(middle.x, middle.y);

        const first = this.createStrut(startNode, diagonalNode);
        const second = this.createStrut(diagonalNode, newNode);
        const third = this.createStrut(startNode, newNode);

        if (!first || !second || !third) {
            this.removeNode(newNode);
            this.removeNode(diagonalNode);
            this.resources[resource] += cost;
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

        const materialName = this.material;
        const material = this.settings(materialName);
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

        const rawA = { x: a.x + offset.x, y: a.y + offset.y };
        const rawB = { x: b.x + offset.x, y: b.y + offset.y };
        const endpointA = this.getBuildEndpoint(rawA.x, rawA.y, sourceStrut.team);
        const endpointB = this.getBuildEndpoint(rawB.x, rawB.y, sourceStrut.team);
        const newA = { x: endpointA.x, y: endpointA.y };
        const newB = { x: endpointB.x, y: endpointB.y };

        const lengths = [
            this.distance(a, newA),
            this.distance(b, newB),
            this.distance(newA, newB)
        ];
        if (lengths.some(length =>
            length < 5 || length > material.maxLength
        )) return false;

        // A box adds three outer beams. Braces are optional, so do not
        // make the whole build fail just because its center joint is blocked.
        const cost = material.cost * 3;
        const resource = this.buildingResource();
        if (!this.charge(cost, resource)) {
            this.showPlacementMessage(
                "Not enough " + (resource === "wood" ? "wood" : "metal") +
                " to build this box."
            );
            return false;
        }

        const nodeAWasExisting = !!endpointA.node;
        const nodeBWasExisting = !!endpointB.node;
        const nodeA = endpointA.node ||
            this.createNode(newA.x, newA.y, { team: sourceStrut.team });
        const nodeB = endpointB.node ||
            this.createNode(newB.x, newB.y, { team: sourceStrut.team });
        const center = this.createNode(
            (a.x + b.x + newA.x + newB.x) / 4,
            (a.y + b.y + newA.y + newB.y) / 4,
            { team: sourceStrut.team }
        );

        const createdNodes = [];
        if (nodeA && !nodeAWasExisting) createdNodes.push(nodeA);
        if (nodeB && !nodeBWasExisting) createdNodes.push(nodeB);
        if (center) createdNodes.push(center);

        const createdBeams = [];
        const rollback = () => {
            for (const beam of createdBeams) this.removeStrut(beam, false);
            for (const node of createdNodes) {
                if (node && !node.isGroundJoint) this.removeNode(node, false);
            }
            this.resources[resource] += cost;
            this.updateHUD();
        };

        if (!nodeA || !nodeB) {
            rollback();
            this.showPlacementMessage("Couldn't place the box joints there. Try a little more space.");
            return false;
        }

        // The three outer beams make the actual box. They are required;
        // internal X braces are added afterward and cannot cancel the box
        // if a brace intersects another nearby structure.
        const framePairs = [
            [sourceStrut.a, nodeA],
            [sourceStrut.b, nodeB],
            [nodeA, nodeB]
        ];
        for (const [from, to] of framePairs) {
            const beam = this.createStrut(from, to, { material: materialName });
            if (!beam) {
                rollback();
                return false;
            }
            createdBeams.push(beam);
        }

        // Add split X braces where valid, but preserve the completed frame
        // if nearby joints or beams prevent one of the diagonals.
        if (center) {
            const bracePairs = [
                [sourceStrut.a, center],
                [center, nodeB],
                [sourceStrut.b, center],
                [center, nodeA]
            ];
            for (const [from, to] of bracePairs) {
                const brace = this.createStrut(from, to, { material: materialName });
                if (brace) createdBeams.push(brace);
            }
        }

        this.checkSupport();
        this.showPlacementMessage("Box built!");
        return true;
    },

    removeStrut(strut, updateSupport = true) {
        if (!strut) return;

        if (strut.isDoor && typeof Weapons !== "undefined" && Weapons.removeLinksForDoor) Weapons.removeLinksForDoor(strut);
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

    removeNode(node, updateSupport = true) {
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

        if (updateSupport) this.checkSupport();
    },

    installationHitTest(item, x, y) {
        const px = x - item.x;
        const py = y - item.y;
        const inRect = (left, top, right, bottom) =>
            px >= left && px <= right && py >= top && py <= bottom;
        const inCircle = (cx, cy, radius) =>
            Math.hypot(px - cx, py - cy) <= radius;

        if (item.type === "drill") {
            return inRect(-19, -17, 19, 31);
        }
        if (item.type === "treeMine") {
            return inRect(-20, -15, 20, 25);
        }
        if (item.type === "battery") {
            return inRect(-19, -27, 19, 22);
        }
        if (item.type === "windmill") {
            // Match the mast and hub, then test the three rotating blades
            // against the same local rectangles used by the renderer.
            if (inRect(-3, -29, 3, 20) || inCircle(0, -29, 5)) return true;
            const dx = px;
            const dy = py + 29;
            const angle = -(item.angle || 0);
            const rx = dx * Math.cos(angle) - dy * Math.sin(angle);
            const ry = dx * Math.sin(angle) + dy * Math.cos(angle);
            const bladePoint = { x: rx, y: ry };
            for (let blade = 0; blade < 3; blade++) {
                const a = blade * Math.PI * 2 / 3;
                const polygon = [
                    {x:-3,y:-4},{x:3,y:-4},{x:7,y:-48},{x:-7,y:-48}
                ].map(point => ({
                    x: point.x * Math.cos(a) - point.y * Math.sin(a),
                    y: point.x * Math.sin(a) + point.y * Math.cos(a)
                }));
                if (this.pointInPolygon(bladePoint, polygon)) return true;
            }
            return false;
        }
        return false;
    },

    mineHitTest(mine, x, y) {
        if (!mine || mine.removed || !mine.node || mine.node.removed) return false;
        const p = mine.node.body.position;
        // Mines are drawn as a 7px marker centered 15px above their joint.
        return Math.hypot(x - p.x, y - (p.y - 15)) <= 9;
    },

    deleteAt(x, y) {
        // Test the actual rendered footprint of each utility, rather than a
        // generic radius around its anchor point.
        const hitInstallation = [...this.installations].reverse().find(item =>
            !item.removed && this.installationHitTest(item, x, y)
        );
        if (hitInstallation) {
            hitInstallation.removed = true;
            this.installations = this.installations.filter(item => item !== hitInstallation);
            this.resources.energy = Math.min(this.resources.energy, this.getEnergyCapacity());
            this.updateHUD();
            return true;
        }

        // Mines have their own small marker hitbox; clicking the supporting
        // node is not required to remove the mine.
        const hitMine = [...this.mines].reverse().find(mine =>
            this.mineHitTest(mine, x, y)
        );
        if (hitMine) {
            this.mines = this.mines.filter(mine => mine !== hitMine);
            this.updateHUD();
            return true;
        }

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
        if (this.repairMode) {
            this.doorMaterial = null;
            this.deleteMode = false;
            this.utilityTool = null;
            if (typeof Weapons !== "undefined") {
                if (Weapons.clearSelectedTool) Weapons.clearSelectedTool();
                if (Weapons.clearSelectedCannon) Weapons.clearSelectedCannon();
            }
        }
        this.updateToolbar();

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
        this.updateDebris(delta);
        this.updateUtilities(delta);

        this.mines = this.mines.filter(mine =>
            this.nodes.includes(mine.node)
        );

        for (const node of this.nodes) {
            node.damageFlash = Math.max(0, (node.damageFlash || 0) - delta);

            const radius = node.isCore ? this.coreRadius : this.nodeRadius;
            const bottom = node.body.position.y + radius;
            node.canHoldMine =
                !node.removed &&
                !node.isCore &&
                Math.abs(bottom - Physics.terrainYAt(node.body.position.x)) <= 8;
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

            if (strut.isDoor) {
                const target = strut.doorOpen ? 1 : 0;
                strut.doorOpenAmount += (target - strut.doorOpenAmount) * Math.min(1, delta / 150);
                if (Math.abs(target - strut.doorOpenAmount) < 0.002) strut.doorOpenAmount = target;
                const swing = strut.doorOpenAmount * (strut.team === "enemy" ? -Math.PI / 2 : Math.PI / 2);
                const angle = strut.hingeAngle + swing;
                const half = (strut.doorLength || strut.length) / 2;
                const centerX = a.x + Math.cos(angle) * half;
                const centerY = a.y + Math.sin(angle) * half;

                // Position the non-dynamic door panel at the hinge swing location.
                Matter.Body.setAngle(strut.body, angle);
                Matter.Body.setPosition(strut.body, { x: centerX, y: centerY });
                strut.doorCollisionOpen = strut.doorOpenAmount >= 0.9;
            } else {
                const centerX = (a.x + b.x) / 2;
                const centerY = (a.y + b.y) / 2;
                const angle = Math.atan2(b.y - a.y, b.x - a.x);

                // Keep ordinary beam hitboxes aligned to their endpoints.
                if (strut.body.fortLength && Math.abs(length - strut.body.fortLength) > 0.5) {
                    const scale = length / strut.body.fortLength;
                    Matter.Body.scale(strut.body, scale, 1);
                    strut.body.fortLength = length;
                }
                Matter.Body.setPosition(strut.body, { x: centerX, y: centerY });
                Matter.Body.setAngle(strut.body, angle);
            }
        }
    },

    updateHUD() {
        const metalElement = document.getElementById("metal-count");
        const woodElement = document.getElementById("wood-count");
        const energyElement = document.getElementById("energy-count");

        if (metalElement) {
            metalElement.textContent = Math.floor(this.resources.metal);
        }

        if (woodElement) {
            woodElement.textContent = Math.floor(this.resources.wood || 0);
        }

        if (energyElement) {
            energyElement.textContent = Math.floor(this.resources.energy);
        }
    },

    setDoorOpen(door, open) {
        if (!door || !door.isDoor || !this.struts.includes(door)) return;
        door.doorOpen = !!open;
        // Opening changes only the panel's appearance. The beam constraint
        // and projectile hitbox stay in place to preserve fort structure.
    },
    drawDoor(ctx, door) {
        const a = door.a.body.position;
        const length = door.doorLength || door.length;
        const angle = door.body.angle;
        ctx.save(); if (door.debrisGroup) ctx.globalAlpha *= door.debrisGroup.alpha;
        // Doors use a distinct dark timber finish so they are easy to identify
        // against ordinary wood and steel fort beams.
        ctx.translate(a.x, a.y); ctx.rotate(angle); ctx.lineCap = "butt";
        ctx.strokeStyle = "#24170f";
        ctx.lineWidth = door.width + 3;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(length, 0); ctx.stroke();
        ctx.strokeStyle = "#4a2d1d";
        ctx.lineWidth = Math.max(3, door.width - 2);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(length, 0); ctx.stroke();
        // A narrow warm highlight gives the dark door a wooden finish.
        ctx.strokeStyle = "#765038";
        ctx.lineWidth = Math.max(1, door.width * 0.16);
        ctx.beginPath(); ctx.moveTo(3, -door.width * 0.18); ctx.lineTo(length - 5, -door.width * 0.18); ctx.stroke();
        ctx.fillStyle = "#c49a59";
        ctx.beginPath(); ctx.arc(length - 8, 0, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    },
    drawDoorPreview(ctx) {
        if (!ctx) return;
                // Draw the live door preview above every battlefield object.
                const doorDrag = this.doorModifierDrag;
                const previewBeam = doorDrag && doorDrag.candidate;
                if (doorDrag && previewBeam && this.struts.includes(previewBeam) && previewBeam.a && previewBeam.b && doorDrag.node) {
                    // Preview from the exact joint the player touched, not
                    // from the beam's arbitrary stored endpoint A.
                    const startNode = doorDrag.node;
                    const endNode = previewBeam.a === startNode ? previewBeam.b :
                        previewBeam.b === startNode ? previewBeam.a : null;
                    if (!endNode) return;
                    const a = startNode.body.position;
                    const b = endNode.body.position;
                    const dx = b.x - a.x, dy = b.y - a.y;
                    const lengthSq = dx * dx + dy * dy;
                    let t = lengthSq ? ((doorDrag.x - a.x) * dx + (doorDrag.y - a.y) * dy) / lengthSq : 0;
                    t = Math.max(0.08, Math.min(0.92, t));
                    const endX = a.x + dx * t, endY = a.y + dy * t;
                    const angle = Math.atan2(dy, dx);
                    const previewMaterial = this.settings(this.doorMaterial || previewBeam.material);
                    ctx.save();
                    ctx.lineCap = "round";
                    ctx.shadowColor = "#37eaff";
                    ctx.shadowBlur = 18;
                    ctx.strokeStyle = "#07131f";
                    ctx.lineWidth = Math.max(14, previewBeam.width + 10);
                    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(endX, endY); ctx.stroke();
                    ctx.shadowBlur = 12;
                    ctx.strokeStyle = "#36eaff";
                    ctx.lineWidth = Math.max(8, previewBeam.width + 3);
                    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(endX, endY); ctx.stroke();
                    ctx.shadowBlur = 0;
                    ctx.strokeStyle = "#ffffff";
                    ctx.lineWidth = 2;
                    ctx.setLineDash([6, 4]);
                    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(endX, endY); ctx.stroke();
                    ctx.setLineDash([]);
                    for (const p of [a, { x: endX, y: endY }]) {
                        ctx.fillStyle = "#ffffff";
                        ctx.strokeStyle = "#087f9c";
                        ctx.lineWidth = 2;
                        ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                    }
                    ctx.restore();
                }
    },
    draw(ctx) {
        if (!ctx) return;

        this.drawGrid(ctx);
        this.drawEnclosedCells(ctx);

        for (const strut of this.struts) {
            if (strut.isDoor) { this.drawDoor(ctx, strut); continue; }
            ctx.save();
            if (strut.debrisGroup) ctx.globalAlpha *= strut.debrisGroup.alpha;
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
            ctx.restore();
        }


        for (const node of this.nodes) {
            ctx.save();
            if (node.debrisGroup) ctx.globalAlpha *= node.debrisGroup.alpha;
            if (node.hidden) {
                ctx.restore();
                continue;
            }

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
            ctx.restore();
        }

        this.drawInstallations(ctx);

        for (const mine of this.mines) {
            ctx.save();
            if (mine.node.debrisGroup) {
                ctx.globalAlpha *= mine.node.debrisGroup.alpha;
            }
            const p = mine.node.body.position;

            ctx.fillStyle = "#32ff9c";
            ctx.beginPath();
            ctx.arc(p.x, p.y - 15, 7, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = "#174d38";
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
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

    drawEnclosedCells(ctx) {
        for (const cell of this.getEnclosedCells("player")) {
            const points = cell.nodes.map(node => node.body.position);
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(points[0].x,points[0].y);
            for (let i=1;i<points.length;i++) ctx.lineTo(points[i].x,points[i].y);
            ctx.closePath();
            ctx.fillStyle = "rgba(5, 9, 16, 0.48)";
            ctx.fill();
            ctx.strokeStyle = "rgba(8, 13, 22, 0.35)";
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
        }
    },

    drawInstallations(ctx) {
        for (const item of this.installations) {
            if (item.removed) continue;
            const {x,y} = item;
            ctx.save();
            if (item.type === "drill") {
                ctx.translate(x,y);
                ctx.fillStyle = "#263746";
                ctx.fillRect(-19,-12,38,25);
                ctx.fillStyle = "#9aa9b5";
                ctx.fillRect(-14,-17,28,8);
                ctx.fillStyle = "#d5a94f";
                ctx.fillRect(-5,-9,10,19);
                ctx.save();
                ctx.translate(0,12);
                ctx.rotate(item.angle);
                ctx.fillStyle = "#b9c7d2";
                ctx.beginPath();
                ctx.moveTo(-5,0); ctx.lineTo(5,0); ctx.lineTo(0,19);
                ctx.closePath(); ctx.fill();
                ctx.restore();
                ctx.fillStyle = "#65dfff";
                ctx.beginPath(); ctx.arc(0,-2,3,0,Math.PI*2); ctx.fill();
            } else if (item.type === "windmill") {
                ctx.translate(x,y);
                ctx.strokeStyle = "#b8c9d7";
                ctx.lineWidth = 5;
                ctx.beginPath(); ctx.moveTo(0,20); ctx.lineTo(0,-29); ctx.stroke();
                ctx.fillStyle = "#d8e4ec";
                ctx.beginPath(); ctx.arc(0,-29,5,0,Math.PI*2); ctx.fill();
                ctx.save();
                ctx.translate(0,-29);
                ctx.rotate(item.angle);
                ctx.fillStyle = "#e5edf4";
                for (let i=0;i<3;i++) {
                    ctx.rotate(Math.PI*2/3);
                    ctx.beginPath();
                    ctx.moveTo(-3,-4); ctx.lineTo(3,-4);
                    ctx.lineTo(7,-48); ctx.lineTo(-7,-48);
                    ctx.closePath(); ctx.fill();
                }
                ctx.restore();
                ctx.fillStyle = "#68d7ff";
                ctx.font = "bold 10px Arial";
                ctx.textAlign = "center";
                ctx.fillText(Math.round(item.output) + "⚡",0,34);
            } else if (item.type === "treeMine") {
                ctx.translate(x,y);
                ctx.fillStyle = "#4a3423";
                ctx.fillRect(-20,-15,40,30);
                ctx.fillStyle = "#8b6a3e";
                ctx.fillRect(-16,-11,32,22);
                ctx.fillStyle = "#314c35";
                ctx.beginPath();
                ctx.arc(-7,-2,7,0,Math.PI*2);
                ctx.arc(5,-4,8,0,Math.PI*2);
                ctx.arc(0,5,7,0,Math.PI*2);
                ctx.fill();
                ctx.fillStyle = "#b8e08a";
                ctx.font = "bold 9px Arial";
                ctx.textAlign = "center";
                ctx.fillText("+WOOD",0,25);
            } else if (item.type === "battery") {
                ctx.translate(x,y);
                ctx.fillStyle = "#263b4b";
                ctx.fillRect(-19,-22,38,44);
                ctx.fillStyle = "#90a8ba";
                ctx.fillRect(-8,-27,16,5);
                ctx.strokeStyle = "#55d9ff";
                ctx.lineWidth = 3;
                ctx.strokeRect(-13,-16,26,32);
                ctx.fillStyle = "#55d9ff";
                ctx.fillRect(-4,-10,8,20);
                ctx.fillRect(-9,-4,18,8);
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

        const cameraOffset = typeof Game !== "undefined" ? Game.cameraX : 0;
        const zoom = typeof Game !== "undefined" ? Game.cameraZoom : 1;
        const visibleWidth = ctx.canvas.width / zoom;
        const visibleHeight = ctx.canvas.height / zoom;

        const startX = Math.floor(cameraOffset / this.gridSize) * this.gridSize;
        for (let x = startX; x < cameraOffset + visibleWidth; x += this.gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, visibleHeight);
            ctx.stroke();
        }

        for (let y = 0; y < visibleHeight; y += this.gridSize) {
            ctx.beginPath();
            ctx.moveTo(cameraOffset, y);
            ctx.lineTo(cameraOffset + visibleWidth, y);
            ctx.stroke();
        }

        ctx.restore();
    },

    drawPreview(ctx) {
        if (!this.drag) return;

        const material = this.settings(this.material);
        ctx.save();
        // High-contrast construction preview remains visible over both
        // darkened fort interiors and bright backgrounds.
        ctx.strokeStyle = "#63e6ff";
        ctx.lineWidth = Math.max(4, material.width + 2);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.shadowColor = "rgba(30, 210, 255, 0.9)";
        ctx.shadowBlur = 9;
        ctx.setLineDash([9, 5]);

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
            ctx.shadowBlur = 0;
            ctx.fillStyle = "rgba(99,230,255,0.85)";
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
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(end.x, end.y, this.nodeRadius + 2, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(99,230,255,0.85)";
            ctx.fill();
        }

        ctx.restore();
    }
};