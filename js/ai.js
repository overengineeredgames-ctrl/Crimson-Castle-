
"use strict";

const AI = {
    initialized: false,

    buildTimer: 0,
    repairTimer: 0,
    targetTimer: 0,
    extraCannonTimer: 0,

    currentTarget: null,
    extraCannonBuilt: false,
    cannonRange: 430,
    expansionCount: 0,
    fortifyTimer: 0,

    difficulty: "normal",

    settings: {
        easy: {
            targetInterval: 0.65,
            repairInterval: 6,
            buildInterval: 11,
            repairAmount: 5,
            extraCannonTime: 9,
            aimError: 0.24
        },

        normal: {
            targetInterval: 0.35,
            repairInterval: 4,
            buildInterval: 6.5,
            repairAmount: 8,
            extraCannonTime: 5,
            aimError: 0.12
        },

        hard: {
            targetInterval: 0.18,
            repairInterval: 2.5,
            buildInterval: 4.5,
            repairAmount: 12,
            extraCannonTime: 3.5,
            aimError: 0.06
        }
    },

    setDifficulty(level) {
        if (!this.settings[level]) return;
        this.difficulty = level;
    },

    get config() {
        return this.settings[this.difficulty] ||
            this.settings.normal;
    },

    init() {
        if (this.initialized) return;

        this.initialized = true;
        this.createEnemyFort();
    },

    createEnemyFort() {
        // Build the AI fort independently; do not modify the player's template.
        const worldWidth = Physics.worldWidth || window.innerWidth * 1.5;
        const leftX = Math.round(worldWidth * 0.65);
        const rightX = leftX + 120;
        const baseY = Building.groundY - Building.nodeRadius;

        const bottomLeft = Building.createNode(leftX, baseY, {
            isFoundation: true,
            team: "enemy"
        });
        const bottomRight = Building.createNode(rightX, baseY, {
            isFoundation: true,
            team: "enemy"
        });

        const topLeft = Building.createNode(leftX, baseY - 140, {
            team: "enemy"
        });
        const topRight = Building.createNode(rightX, baseY - 140, {
            team: "enemy"
        });

        const core = Building.createCore(
            (leftX + rightX) / 2,
            baseY - 90,
            "enemy"
        );

        // Outer frame and crossing braces.
        Building.createStrut(bottomLeft, bottomRight);
        Building.createStrut(bottomLeft, topLeft);
        Building.createStrut(bottomRight, topRight);
        Building.createStrut(topLeft, topRight);
        Building.createStrut(bottomLeft, topRight);
        Building.createStrut(bottomRight, topLeft);

        // The two lower supports meet at the centered core, forming an / shape.
        Building.createStrut(bottomLeft, core);
        Building.createStrut(bottomRight, core);

        // Support the core from the upper frame as well.
        Building.createStrut(topLeft, core);
        Building.createStrut(topRight, core);

        Building.checkSupport();
        Weapons.addCannon(topRight, "enemy", true);
    },
    getPlayerNodes() {
        return Building.nodes.filter(node =>
            node.team === "player" &&
            !node.removed &&
            node.body &&
            node.body.position
        );
    },

    getPlayerStruts() {
        return Building.struts.filter(strut =>
            strut.team === "player" &&
            !strut.removed &&
            strut.a &&
            strut.b &&
            !strut.a.removed &&
            !strut.b.removed
        );
    },

    getTargetPoint(target) {
        if (target.type === "node") {
            return {
                x: target.node.body.position.x,
                y: target.node.body.position.y
            };
        }

        const a = target.strut.a.body.position;
        const b = target.strut.b.body.position;

        return {
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2
        };
    },

    getTargetVelocity(target) {
        if (target.type === "node") {
            return {
                x: target.node.body.velocity.x,
                y: target.node.body.velocity.y
            };
        }

        const a = target.strut.a.body.velocity;
        const b = target.strut.b.body.velocity;

        return {
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2
        };
    },

    findBestTarget(cannon) {
        if (!cannon || !cannon.node || cannon.node.removed) {
            return null;
        }

        const start = cannon.node.body.position;

        let bestTarget = null;
        let bestScore = -Infinity;

        for (const node of this.getPlayerNodes()) {
            // Never choose the ground/foundation as a preferred target.
            // This was the main reason the AI kept aiming into the floor.
            if (node.isFoundation) continue;

            const position = node.body.position;

            const distance = Math.hypot(
                position.x - start.x,
                position.y - start.y
            );

            const healthRatio = node.maxHealth > 0
                ? node.health / node.maxHealth
                : 1;

            // Spread fire across the fort instead of tunnelling one turret.
            // Distance matters, but ordinary structural joints remain valuable.
            let score = 1000 - distance * 0.65;
            const carriesCannon = Weapons.cannons.some(item =>
                item.team === "player" && item.node === node
            );

            if (node.isCore) score += 220;
            else score += 140;

            // Turrets are important, but should not dominate every other target.
            if (carriesCannon) score += 120;

            // Damaged parts are attractive finishing targets.
            score += (1 - healthRatio) * 220;

            // Small deterministic variation prevents every cannon selecting
            // exactly the same structural joint when scores are close.
            score += ((node.body.id * 37) % 41);

            const target = {
                type: "node",
                node
            };

            if (score > bestScore) {
                bestScore = score;
                bestTarget = target;
            }
        }

        for (const strut of this.getPlayerStruts()) {
            // Ground-level foundation beams are not useful combat targets.
            if (strut.a.isFoundation || strut.b.isFoundation) continue;

            const a = strut.a.body.position;
            const b = strut.b.body.position;

            const x = (a.x + b.x) / 2;
            const y = (a.y + b.y) / 2;

            const distance = Math.hypot(
                x - start.x,
                y - start.y
            );

            const healthRatio = strut.maxHealth > 0
                ? strut.health / strut.maxHealth
                : 1;

            // Beams should compete fairly with joints as targets.
            let score = 1010 - distance * 0.65;

            score += (1 - healthRatio) * 280;

            if (strut.a.isCore || strut.b.isCore) {
                score += 100;
            }

            // A little stable variation helps distribute shots along the wall.
            score += ((strut.body.id * 19) % 37);

            const target = {
                type: "strut",
                strut
            };

            if (score > bestScore) {
                bestScore = score;
                bestTarget = target;
            }
        }

        return bestTarget;
    },

    getGravityPerFrame() {
        const gravity = (CONFIG.GRAVITY || 1) *
            (CONFIG.GRAVITY_SCALE || 0.001);

        // Matter.js uses a 60 FPS reference timestep.
        const frameTime = 1000 / 60;

        // Physics.update() advances Matter in four quarter-frame substeps.
        // Match that integration here; using a full-frame gravity value made
        // the AI aim far too high/low compared with real projectile motion.
        return gravity * frameTime * frameTime / 4;
    },

    solveTrajectory(start, target, velocity, speed) {
        const dx = target.x - start.x;
        const dy = target.y - start.y;

        const horizontalDistance = Math.abs(dx);

        if (horizontalDistance < 0.001 || speed <= 0) {
            return Math.atan2(dy, dx);
        }

        const gravity = this.getGravityPerFrame();

        if (gravity <= 0) {
            return Math.atan2(dy, dx);
        }

        // Screen coordinates have positive Y pointing down.
        // Convert target height into conventional upward-positive height.
        const height = -dy;

        const speedSquared = speed * speed;
        const gravityDistance = gravity * horizontalDistance;

        const discriminant =
            speedSquared * speedSquared -
            gravity * (
                gravity * horizontalDistance * horizontalDistance +
                2 * height * speedSquared
            );

        // The target is outside the possible ballistic range.
        // Use direct aiming as a fallback.
        if (discriminant < 0) {
            return Math.atan2(dy, dx);
        }

        // Choose the lower trajectory for a faster shot.
        const root = Math.sqrt(discriminant);

        const tanAngle =
            (speedSquared - root) / gravityDistance;

        const elevation = Math.atan(tanAngle);

        const horizontalDirection = dx >= 0 ? 1 : -1;

        // Convert conventional elevation to Canvas/Matter angle.
        const aimX = horizontalDirection * Math.cos(elevation);
        const aimY = -Math.sin(elevation);

        return Math.atan2(aimY, aimX);
    },

    calculateAim(cannon, target) {
        if (!cannon || !target || !cannon.node) {
            return cannon ? cannon.angle : 0;
        }

        const start = cannon.node.body.position;
        const originalPoint = this.getTargetPoint(target);
        const velocity = this.getTargetVelocity(target);

        const speed = Weapons.projectileSpeed || 12;

        let predictedPoint = {
            x: originalPoint.x,
            y: originalPoint.y
        };

        let angle = 0;
        let flightFrames = 0;

        // Recalculate target movement and trajectory several times.
        for (let i = 0; i < 6; i++) {
            angle = this.solveTrajectory(
                start,
                predictedPoint,
                velocity,
                speed
            );

            const horizontalSpeed =
                Math.abs(Math.cos(angle) * speed);

            if (horizontalSpeed < 0.001) break;

            flightFrames = Math.abs(
                predictedPoint.x - start.x
            ) / horizontalSpeed;

            predictedPoint = {
                x: originalPoint.x + velocity.x * flightFrames,
                y: originalPoint.y + velocity.y * flightFrames
            };
        }

        // Solve one final time using the predicted impact position.
        angle = this.solveTrajectory(
            start,
            predictedPoint,
            velocity,
            speed
        );

        return angle;
    },

    getRandomAimError() {
        const maxError = this.config.aimError;

        return (Math.random() * 2 - 1) * maxError;
    },

    updateCannons() {
        for (const cannon of Weapons.cannons) {
            if (
                cannon.team !== "enemy" ||
                !cannon.node ||
                cannon.node.removed
            ) continue;

            // Each cannon independently tracks the nearest valuable object.
            const target = this.findBestTarget(cannon);
            if (!target) continue;

            const from = cannon.node.body.position;
            const point = this.getTargetPoint(target);
            const distance = Math.hypot(point.x - from.x, point.y - from.y);
            cannon.target = target;
            cannon.targetInRange = distance <= this.cannonRange;

            // Keep tracking the target even while it is out of range.
            // The cannon may aim at it, but only fires when a shot is possible.
            const perfectAngle = this.calculateAim(cannon, target);
            cannon.angle = perfectAngle;

            if (!cannon.targetInRange) continue;

            if (cannon.cooldown <= 0) {
                cannon.angle = perfectAngle + this.getRandomAimError();
                Weapons.fire(cannon);
            }
        }
    },

    repairFort() {
        const config = this.config;

        for (const node of Building.nodes) {
            if (
                node.team !== "enemy" ||
                node.removed ||
                node.health >= node.maxHealth
            ) {
                continue;
            }

            node.health = Math.min(
                node.maxHealth,
                node.health + config.repairAmount
            );
        }

        for (const strut of Building.struts) {
            if (
                strut.team !== "enemy" ||
                strut.removed ||
                strut.health >= strut.maxHealth
            ) {
                continue;
            }

            strut.health = Math.min(
                strut.maxHealth,
                strut.health + config.repairAmount * 1.3
            );
        }
    },

    reinforceFort() {
        const nodes = Building.nodes.filter(node =>
            node.team === "enemy" &&
            !node.removed &&
            !node.isCore
        );

        const foundations = nodes.filter(node =>
            node.isFoundation
        );

        if (!foundations.length) return;

        let weakestNode = null;
        let weakestScore = Infinity;

        for (const node of nodes) {
            if (node.isFoundation) continue;

            const connected = Building.struts.filter(strut =>
                !strut.removed &&
                (
                    strut.a === node ||
                    strut.b === node
                )
            );

            const healthRatio = node.maxHealth > 0
                ? node.health / node.maxHealth
                : 1;

            const weakness =
                connected.length * 100 +
                healthRatio * 30;

            if (weakness < weakestScore) {
                weakestScore = weakness;
                weakestNode = node;
            }
        }

        if (!weakestNode) return;

        let bestFoundation = null;
        let bestDistance = Infinity;

        for (const foundation of foundations) {
            const a = foundation.body.position;
            const b = weakestNode.body.position;

            const distance = Math.hypot(
                a.x - b.x,
                a.y - b.y
            );

            if (
                distance < 20 ||
                distance > CONFIG.MAX_STRUT_LENGTH
            ) {
                continue;
            }

            const alreadyConnected = Building.struts.some(strut =>
                !strut.removed &&
                (
                    (strut.a === foundation &&
                     strut.b === weakestNode) ||
                    (strut.b === foundation &&
                     strut.a === weakestNode)
                )
            );

            if (alreadyConnected) continue;

            if (distance < bestDistance) {
                bestDistance = distance;
                bestFoundation = foundation;
            }
        }

        if (bestFoundation) {
            Building.createStrut(
                bestFoundation,
                weakestNode,
                { material: "steel" }
            );
        }
    },

    buildExtraCannon() {
        // Expand only when no enemy cannon currently has a target in range.
        const enemyCannons = Weapons.cannons.filter(cannon =>
            cannon.team === "enemy" && cannon.node && !cannon.node.removed
        );
        if (!enemyCannons.length) return;

        const hasShot = enemyCannons.some(cannon => {
            const target = this.findBestTarget(cannon);
            if (!target) return false;
            const from = cannon.node.body.position;
            const point = this.getTargetPoint(target);
            return Math.hypot(point.x - from.x, point.y - from.y) <= this.cannonRange;
        });

        if (hasShot) return;
        if (this.extraCannonTimer < this.config.extraCannonTime) return;

        this.buildForwardCannon();
    },

    // Prevent an AI expansion from overlapping or cutting through player defenses.
    segmentDistance(a1, a2, b1, b2) {
        const orient = (p, q, r) =>
            (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
        const onSegment = (p, q, r) =>
            Math.min(p.x, r.x) - 0.001 <= q.x &&
            q.x <= Math.max(p.x, r.x) + 0.001 &&
            Math.min(p.y, r.y) - 0.001 <= q.y &&
            q.y <= Math.max(p.y, r.y) + 0.001;
        const o1 = orient(a1, a2, b1);
        const o2 = orient(a1, a2, b2);
        const o3 = orient(b1, b2, a1);
        const o4 = orient(b1, b2, a2);
        if (
            ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) &&
            ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))
        ) return 0;
        if (o1 === 0 && onSegment(a1, b1, a2)) return 0;
        if (o2 === 0 && onSegment(a1, b2, a2)) return 0;
        if (o3 === 0 && onSegment(b1, a1, b2)) return 0;
        if (o4 === 0 && onSegment(b1, a2, b2)) return 0;
        return Math.min(
            Building.pointToSegmentDistance(a1.x, a1.y, b1, b2),
            Building.pointToSegmentDistance(a2.x, a2.y, b1, b2),
            Building.pointToSegmentDistance(b1.x, b1.y, a1, a2),
            Building.pointToSegmentDistance(b2.x, b2.y, a1, a2)
        );
    },

    wouldCrossPlayerDefense(points, plannedSegments) {
        const playerNodes = this.getPlayerNodes();
        const playerStruts = this.getPlayerStruts();
        const clearance = 30;

        for (const point of points) {
            for (const node of playerNodes) {
                if (Building.distance(point, node.body.position) < clearance + Building.nodeRadius) {
                    return true;
                }
            }
            for (const strut of playerStruts) {
                if (Building.pointToSegmentDistance(
                    point.x, point.y,
                    strut.a.body.position, strut.b.body.position
                ) < clearance) return true;
            }
        }

        for (const [start, end] of plannedSegments) {
            for (const strut of playerStruts) {
                if (this.segmentDistance(
                    start, end,
                    strut.a.body.position, strut.b.body.position
                ) < clearance) return true;
            }
        }
        return false;
    },

    buildForwardCannon() {
        const enemyNodes = Building.nodes.filter(node =>
            node.team === "enemy" && !node.removed && !node.isCore
        );
        if (!enemyNodes.length) return false;

        // Pick the forward-most structural joint, then build toward the player.
        const anchors = enemyNodes.filter(node => !node.isFoundation);
        if (!anchors.length) return false;
        anchors.sort((a, b) => a.body.position.x - b.body.position.x);
        const anchor = anchors[0];
        const baseY = Building.groundY - Building.nodeRadius;
        const x = anchor.body.position.x - 180;

        if (x < 80) return false;

        const mountY = anchor.body.position.y;
        const plannedMount = { x, y: mountY };
        const plannedUpper = { x, y: mountY - 100 };
        const plannedSegments = [
            [anchor.body.position, plannedMount],
            [anchor.body.position, plannedUpper],
            [plannedMount, plannedUpper]
        ];

        // Stop at the player's actual wall instead of spawning AI beams through it.
        if (this.wouldCrossPlayerDefense(
            [plannedMount, plannedUpper],
            plannedSegments
        )) {
            this.extraCannonTimer = 0;
            return false;
        }

        const mount = Building.createNode(x, mountY, {
            team: "enemy",
            material: "steel"
        });
        const upper = Building.createNode(x, mountY - 100, {
            team: "enemy",
            material: "steel"
        });

        // A braced forward tower: cannon mount, vertical armor and diagonals.
        const foundation = enemyNodes
            .filter(node => node.isFoundation)
            .sort((a, b) =>
                Math.abs(a.body.position.x - anchor.body.position.x) -
                Math.abs(b.body.position.x - anchor.body.position.x)
            )[0];

        const beams = [
            Building.createStrut(anchor, mount, { material: "steel" }),
            Building.createStrut(anchor, upper, { material: "steel" }),
            Building.createStrut(mount, upper, { material: "steel" })
        ];

        if (foundation) {
            const distance = Building.distance(
                foundation.body.position,
                mount.body.position
            );
            if (distance <= Building.settings("steel").maxLength) {
                beams.push(Building.createStrut(foundation, mount, {
                    material: "steel"
                }));
            }
        }

        if (beams.some(beam => !beam)) {
            Building.removeNode(mount);
            Building.removeNode(upper);
            return false;
        }

        Building.checkSupport();
        Weapons.addCannon(mount, "enemy", true);
        this.expansionCount++;
        this.extraCannonTimer = 0;
        return true;
    },

    update(delta = 16.667) {
        if (!this.initialized) return;

        const seconds = delta / 1000;

        this.targetTimer += seconds;
        this.repairTimer += seconds;
        this.buildTimer += seconds;
        this.extraCannonTimer += seconds;

        if (this.targetTimer >= this.config.targetInterval) {
            this.targetTimer = 0;

            const cannon = Weapons.cannons.find(item =>
                item.team === "enemy" &&
                item.node &&
                !item.node.removed
            );

            this.currentTarget = cannon
                ? this.findBestTarget(cannon)
                : null;
        }

        if (this.repairTimer >= this.config.repairInterval) {
            this.repairTimer = 0;
            this.repairFort();
        }

        if (this.buildTimer >= this.config.buildInterval) {
            this.buildTimer = 0;
            this.reinforceFort();
        }

        this.buildExtraCannon();
        this.updateCannons();
    }
};