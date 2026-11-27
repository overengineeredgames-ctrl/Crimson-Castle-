"use strict";

var Physics = window.Physics = {
    engine: null,
    world: null,
    ground: null,
    leftWall: null,
    rightWall: null,
    groundY: 0,
    worldWidth: 0,
    terrainPoints: [],
    terrainBodies: [],

    terrainYAt(x) {
        const points = this.terrainPoints;
        if (!points.length) return this.groundY;
        const clamped = Math.max(0, Math.min(this.worldWidth, x));
        const index = Math.min(points.length - 2, Math.floor(clamped / (this.worldWidth / (points.length - 1))));
        const a = points[index], b = points[index + 1];
        const t = (clamped - a.x) / Math.max(1, b.x - a.x);
        return a.y + (b.y - a.y) * t;
    },

    generateTerrain(mapId = "base") {
        this.terrainPoints = [];
        this.terrainBodies = [];
        const step = 90;
        const playerZone = this.worldWidth * 0.35;
        const enemyZone = this.worldWidth * 0.62;
        for (let x = 0; x <= this.worldWidth + step; x += step) {
            const safePlayer = Math.max(0, 1 - Math.abs(x - playerZone) / 260);
            const safeEnemy = Math.max(0, 1 - Math.abs(x - enemyZone) / 280);
            const safe = Math.max(safePlayer, safeEnemy);
            const hills = Math.sin(x * 0.0021) * 34 + Math.sin(x * 0.0063 + 1.4) * 17 + Math.sin(x * 0.011 + 0.7) * 7;

            // Mountain Map: much taller, wider 2500px peaks placed where the starting camera
            // can see their inner faces. The outer edges still climb toward the walls.
            // Keep the main fort-building zones comparatively clear.
            const sideHills = mapId === "mountain"
                ? 2500 * Math.exp(-Math.pow((x - this.worldWidth * 0.25) / (this.worldWidth * 0.10), 2)) +
                  2500 * Math.exp(-Math.pow((x - this.worldWidth * 0.75) / (this.worldWidth * 0.10), 2))
                : 0;
            const y = this.groundY + hills * (1 - safe * 0.92) - sideHills;
            this.terrainPoints.push({ x: Math.min(x, this.worldWidth), y });
            if (x >= this.worldWidth) break;
        }
        const thickness = 190;
        for (let i = 0; i < this.terrainPoints.length - 1; i++) {
            const a = this.terrainPoints[i], b = this.terrainPoints[i + 1];
            const dx = b.x - a.x, dy = b.y - a.y;
            const length = Math.hypot(dx, dy) + 4;
            const angle = Math.atan2(dy, dx);
            const body = Matter.Bodies.rectangle(
                (a.x + b.x) / 2 - Math.sin(angle) * thickness / 2,
                (a.y + b.y) / 2 + Math.cos(angle) * thickness / 2,
                length, thickness,
                { isStatic: true, label: "terrain", friction: 1, frictionStatic: 1, restitution: 0, slop: 0.01 }
            );
            this.terrainBodies.push(body);
        }
        Matter.Composite.add(this.world, this.terrainBodies);
    },

    init(mapId = "base") {
        this.engine = Matter.Engine.create();
        this.world = this.engine.world;

        this.engine.gravity.x = 0;
        this.engine.gravity.y = CONFIG.GRAVITY || 1;
        this.engine.gravity.scale = CONFIG.GRAVITY_SCALE || 0.001;

        // Bodies marked noGravity (the Sniper round) still use normal collision
        // physics, but gravity is cancelled before each physics substep.
        Matter.Events.on(this.engine, "beforeUpdate", () => {
            const gravity = this.engine.gravity;
            for (const body of this.world.bodies) {
                if (!body.noGravity || body.isStatic || body.isSleeping) continue;
                body.force.x -= body.mass * gravity.x * gravity.scale;
                body.force.y -= body.mass * gravity.y * gravity.scale;
            }
        });

        // Improve physics stability.
        this.engine.positionIterations = 12;
        this.engine.velocityIterations = 10;
        this.engine.constraintIterations = 8;
        this.engine.enableSleeping = false;

        // A wider battlefield gives both forts room to expand and fight.
        this.worldWidth = Math.round(window.innerWidth * 3.6);
        this.groundY = window.innerHeight * 0.82;

        const groundThickness = 160;

        this.ground = Matter.Bodies.rectangle(
            this.worldWidth / 2,
            this.groundY + 100 + groundThickness / 2,
            this.worldWidth + 2000,
            groundThickness,
            {
                isStatic: true,
                label: "ground",
                friction: 1,
                frictionStatic: 1,
                restitution: 0,
                slop: 0.01
            }
        );

        this.leftWall = Matter.Bodies.rectangle(
            -25,
            window.innerHeight / 2,
            50,
            window.innerHeight * 4,
            {
                isStatic: true,
                label: "left-wall",
                friction: 1,
                restitution: 0
            }
        );

        this.rightWall = Matter.Bodies.rectangle(
            this.worldWidth + 25,
            window.innerHeight / 2,
            50,
            window.innerHeight * 4,
            {
                isStatic: true,
                label: "right-wall",
                friction: 1,
                restitution: 0
            }
        );

        Matter.Composite.add(this.world, [
            this.ground,
            this.leftWall,
            this.rightWall
        ]);

        this.generateTerrain(mapId);
        this.setupCollisions();
    },

    setupCollisions() {
        Matter.Events.on(this.engine, "collisionStart", event => {
            for (const pair of event.pairs) {
                const bodyA = pair.bodyA;
                const bodyB = pair.bodyB;

                const bullet = bodyA.isProjectile
                    ? bodyA
                    : bodyB.isProjectile
                        ? bodyB
                        : null;

                if (!bullet || bullet.hasHit) continue;

                const target = bullet === bodyA ? bodyB : bodyA;

                if (target.isProjectile) continue;

                const targetNode = typeof Building !== "undefined"
                    ? Building.nodes.find(node => node.body === target)
                    : null;

                // Friendly joints remain pass-through, but every team's
                // structural beams can stop projectiles.
                if (targetNode) {
                    if (targetNode.team === bullet.team) continue;

                    bullet.hasHit = true;

                    Building.damageNode(
                        target,
                        bullet.damage || 35
                    );

                    Matter.Composite.remove(this.world, bullet);
                    continue;
                }

                // Closed doors block bullets from BOTH teams. A fully opened
                // door creates a firing passage for either team; its structural
                // constraint remains intact and the door can still be closed.
                if (target.isFortBeam) {
                    const strut = target.fortStrut;
                    if (target.isFortDoor && strut && strut.doorOpenAmount >= 0.9) {
                        continue;
                    }

                    bullet.hasHit = true;

                    Building.damageStrut(
                        target,
                        bullet.damage || 35
                    );

                    Matter.Composite.remove(this.world, bullet);
                    continue;
                }

                // Hit the ground or world boundaries.
                if (
                    target === this.ground ||
                    target.label === "terrain" ||
                    target === this.leftWall ||
                    target === this.rightWall
                ) {
                    bullet.hasHit = true;
                    Matter.Composite.remove(this.world, bullet);
                }
            }
        });
    },

    update(delta = 16.667) {
        if (!this.engine) return;

        const safeDelta = Math.max(1, Math.min(delta, 33.333));

        // Four smaller physics steps reduce tunnelling.
        const step = safeDelta / 4;

        for (let i = 0; i < 4; i++) {
            Matter.Engine.update(this.engine, step);
        }
    }
};