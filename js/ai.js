
"use strict";

const AI = {
    initialized: false,

    buildTimer: 0,
    repairTimer: 0,
    targetTimer: 0,
    extraCannonTimer: 0,

    currentTarget: null,
    extraCannonBuilt: false,

    difficulty: "normal",

    settings: {
        easy: {
            targetInterval: 0.65,
            repairInterval: 1.2,
            buildInterval: 15,
            repairAmount: 5,
            extraCannonTime: Infinity,
            aimError: 0.3
        },

        normal: {
            targetInterval: 0.35,
            repairInterval: 0.7,
            buildInterval: 9,
            repairAmount: 9,
            extraCannonTime: 40,
            aimError: 0.2
        },

        hard: {
            targetInterval: 0.18,
            repairInterval: 0.4,
            buildInterval: 5,
            repairAmount: 14,
            extraCannonTime: 22,
            aimError: 0.1
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
        const worldWidth =
            Physics.worldWidth || window.innerWidth * 1.5;

        const leftX = Math.round(worldWidth * 0.65);
        // Keep every diagonal brace within the 220px strut limit.
        const rightX = leftX + 140;

        const baseY = Building.groundY - Building.nodeRadius;
        const topY = baseY - 150;

        const lb = Building.createNode(leftX, baseY, {
            isFoundation: true,
            team: "enemy"
        });

        const rb = Building.createNode(rightX, baseY, {
            isFoundation: true,
            team: "enemy"
        });

        const lt = Building.createNode(leftX, topY, {
            team: "enemy"
        });

        const rt = Building.createNode(rightX, topY, {
            team: "enemy"
        });

        const core = Building.createCore(
            (leftX + rightX) / 2,
            (baseY + topY) / 2,
            "enemy"
        );

        Building.createStrut(lb, rb, { material: "steel" });
        Building.createStrut(lb, lt, { material: "steel" });
        Building.createStrut(rb, rt, { material: "steel" });
        Building.createStrut(lt, rt, { material: "steel" });

        Building.createStrut(lb, rt, { material: "steel" });
        Building.createStrut(rb, lt, { material: "steel" });

        Building.createStrut(core, lt, { material: "steel" });
        Building.createStrut(core, rt, { material: "steel" });

        Building.checkSupport();

        Weapons.addCannon(rt, "enemy", true);
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
            strut.nodeA &&
            strut.nodeB &&
            !strut.nodeA.removed &&
            !strut.nodeB.removed
        );
    },

    getTargetPoint(target) {
        if (target.type === "node") {
            return {
                x: target.node.body.position.x,
                y: target.node.body.position.y
            };
        }

        const a = target.strut.nodeA.body.position;
        const b = target.strut.nodeB.body.position;

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

        const a = target.strut.nodeA.body.velocity;
        const b = target.strut.nodeB.body.velocity;

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
            const position = node.body.position;

            const distance = Math.hypot(
                position.x - start.x,
                position.y - start.y
            );

            const healthRatio = node.maxHealth > 0
                ? node.health / node.maxHealth
                : 1;

            let score = 250 - distance * 0.3;

            if (node.isCore) {
                score += 650;
            } else if (!node.isFoundation) {
                score += 110;
            } else {
                score -= 180;
            }

            score += (1 - healthRatio) * 220;

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
            const a = strut.nodeA.body.position;
            const b = strut.nodeB.body.position;

            const x = (a.x + b.x) / 2;
            const y = (a.y + b.y) / 2;

            const distance = Math.hypot(
                x - start.x,
                y - start.y
            );

            const healthRatio = strut.maxHealth > 0
                ? strut.health / strut.maxHealth
                : 1;

            let score = 180 - distance * 0.3;

            score += (1 - healthRatio) * 320;

            if (
                strut.nodeA.isCore ||
                strut.nodeB.isCore
            ) {
                score += 240;
            }

            if (
                strut.nodeA.isFoundation ||
                strut.nodeB.isFoundation
            ) {
                score += 45;
            }

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

        return gravity * frameTime * frameTime;
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
            ) {
                continue;
            }

            if (!this.currentTarget) continue;

            // Calculate a fresh ballistic trajectory.
            const perfectAngle = this.calculateAim(
                cannon,
                this.currentTarget
            );

            // Keep the cannon's displayed aim accurate between shots.
            cannon.angle = perfectAngle;

            if (cannon.cooldown <= 0) {
                // Apply random error only once per shot.
                cannon.angle =
                    perfectAngle + this.getRandomAimError();

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
                    strut.nodeA === node ||
                    strut.nodeB === node
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
                    (strut.nodeA === foundation &&
                     strut.nodeB === weakestNode) ||
                    (strut.nodeB === foundation &&
                     strut.nodeA === weakestNode)
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
                "steel"
            );
        }
    },

    buildExtraCannon() {
        if (this.extraCannonBuilt) return;

        if (this.extraCannonTimer < this.config.extraCannonTime) {
            return;
        }

        const enemyNodes = Building.nodes.filter(node =>
            node.team === "enemy" &&
            !node.removed &&
            !node.isCore &&
            !node.isFoundation
        );

        if (enemyNodes.length < 2) return;

        enemyNodes.sort((a, b) =>
            a.body.position.y - b.body.position.y
        );

        const mount = enemyNodes.find(node =>
            !Weapons.cannons.some(cannon =>
                cannon.node === node &&
                cannon.team === "enemy"
            )
        );

        if (!mount) return;

        Weapons.addCannon(mount, "enemy", true);
        this.extraCannonBuilt = true;
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