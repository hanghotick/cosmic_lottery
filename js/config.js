// Configuration constants for the Cosmic Lottery game
export const PARTICLE_CONFIG = {
    STRIDE: 3,
    RADIUS: 1.0,
    SPACING: 20,
    MAX_COUNT: 10000,
    COLOR: {
        HUE: 270,
        SATURATION: 70,
        LIGHTNESS: 60
    }
};

export const ANIMATION_CONFIG = {
    PHASES: {
        FLOATING: 'floating',
        SWIRLING: 'swirling',
        BLACKHOLE: 'blackhole',
        CLASHING: 'clashing',
        LINING_UP: 'liningUp'
    },
    DURATIONS: {
        SWIRL: 8000,    // 8 seconds for initial swirl
        BLACKHOLE: 4000, // 4 seconds for blackhole effect
        EXPLOSION: 3000, // 3 seconds for clash/explosion
        LINE_UP: 2000   // 2 seconds for final lineup
    },
    EASING: {
        // Cubic easing functions
        easeInCubic: t => t * t * t,
        easeOutCubic: t => 1 - Math.pow(1 - t, 3),
        easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
        
        // Exponential easing for dramatic effects
        easeInExpo: t => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
        easeOutExpo: t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
        easeInOutExpo: t => t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? 
            Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2
    }
};

export const PHYSICS_CONFIG = {
    // Base parameters
    BOX_SIZE: 200,
    DAMPING: 0.9995,
    
    // Initial motion parameters
    SPEED_FACTOR: 0.002,
    GRAVITY_BASE: 0.00002,
    ORBITAL_BASE: 0.0002,
    RANDOM_MOTION: 0.02,
    
    // Blackhole phase parameters
    GRAVITY_MAX: 0.0006,    // 30x stronger than base
    ORBITAL_MAX: 0.003,     // 15x stronger than base
    ACCELERATION: 0.000005, // How quickly forces increase
    
    // Cosmic parameters
    PECULIAR_VELOCITY: {
        X: 0.000005,
        Y: 0.0000025,
        Z: 0.000005
    },
    PECULIAR_CHANGE_RATE: 0.00000005,
    COSMIC_EXPANSION: 0.00000005
};

export const CAMERA_CONFIG = {
    MIN_Z: 50,
    MAX_Z: 500,
    TARGET_Z: 60,
    ZOOM_SENSITIVITY: 0.1,
    DEFAULT_PHI: Math.PI / 4,
    DEFAULT_THETA: Math.PI / 2
};
