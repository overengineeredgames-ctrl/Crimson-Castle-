"use strict";

const Physics = {
    engine: null,
    world: null,
    ground: null,
    leftWall: null,
    rightWall: null,
    groundY: 0,
    worldWidth: 0,

    init() {
        this.engine = Matter.Engine.create();
        this.world = this.engine.world;

        this.engine.gravity.x = 0;
        this.engine.gravity.y = CONFIG.GRAVITY || 1;
        this.engine.gravity.scale = CONFIG.GRAVITY_SCALE || 0.001;

        // Improve physics stability.
        this.engine.positionIterations = 12;
        this.engine.velocityIterations = 10;
        this.engine.constraintIterations = 8;
        this.engine.enableSleeping = false;

        // A wider battlefield gives both forts room to expand and fight.
        this.worldWidth = Math.round(window.innerWidth * 2.4);
        this.groundY = window.innerHeight * 0.82;

        const groundThickness = 160;

        this.ground = Matter.Bodies.rectangle(
            this.worldWidth / 2,
            this.groundY + groundThickness / 2,
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

                // Hit a building joint or core.
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

                // Hit a beam.
                if (target.isFortBeam) {
                    if (target.team === bullet.team) continue;

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