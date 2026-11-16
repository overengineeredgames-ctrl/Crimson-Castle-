
"use strict";

const CONFIG = {

    // Physics
    GRAVITY: 1.0,
    GRAVITY_SCALE: 0.001,

    // Building costs
    WOOD_COST: 10,
    STEEL_COST: 25,

    // Structural properties
    WOOD_STIFFNESS: 0.85,
    STEEL_STIFFNESS: 0.98,

    WOOD_DENSITY: 0.001,
    STEEL_DENSITY: 0.003,

    MAX_STRUT_LENGTH: 220,

    // Breaking force thresholds
    WOOD_BREAK_FORCE: 0.035,
    STEEL_BREAK_FORCE: 0.15,

    // Building
    NODE_SNAP_RADIUS: 25,
    NODE_RADIUS: 6,
    STRUT_WIDTH: 7,

    // Resources
    STARTING_METAL: 500,
    STARTING_ENERGY: 100,

    METAL_GENERATION: 2,
    ENERGY_GENERATION: 1,

    RESOURCE_TICK_RATE: 1000,

    // World
    GROUND_HEIGHT: 90,
    CLIFF_WIDTH: 260,

    // Collision categories
    CATEGORY: {
        WORLD: 0x0001,
        FRIENDLY_STRUT: 0x0002,
        FRIENDLY_PROJECTILE: 0x0004,
        ENEMY: 0x0008
    },

    // Colors
    COLORS: {
        wood: "#a96c35",
        woodDark: "#704321",
        steel: "#9eafbd",
        steelDark: "#586b7c",
        node: "#dceaff",
        reactor: "#26eaff"
    }
};