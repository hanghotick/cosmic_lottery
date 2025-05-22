// Configuration constants for the Cosmic Lottery game

export const PARTICLE_CONFIG = {
    STRIDE: 3,
    RADIUS: 1.0,
    MAX_COUNT: 10000,
    COLOR: {
        HUE: 270,        // Purple base color
        SATURATION: 70,  // 70%
        LIGHTNESS: 60    // 60%
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
        SWIRL: 8000,     // 8 seconds for initial swirl
        BLACKHOLE: 4000, // 4 seconds for blackhole effect
        EXPLOSION: 3000, // 3 seconds for clash/explosion
        LINE_UP: 2000    // 2 seconds for final lineup
    }
};

export const PHYSICS_CONFIG = {
    // Box boundaries
    BOX_SIZE: 100,
    
    // Basic motion
    DAMPING: 0.98,
    GRAVITY_BASE: 0.001,
    GRAVITY_MAX: 0.005,
    
    // Orbital motion
    ORBITAL_BASE: 0.0005,
    ORBITAL_MAX: 0.002,
    
    // Random motion
    GALACTIC_RANDOM_MOTION: 0.001,
    PECULIAR_VELOCITY: [0.0001, 0.0001, 0.0001],
    PECULIAR_VELOCITY_CHANGE_RATE: 0.0005,
    
    // Cosmic expansion
    COSMIC_EXPANSION_FACTOR: 0.00001,
    
    // Blackhole effect
    BLACKHOLE_ABSORPTION_RADIUS: 5.0,
    BLACKHOLE_COLOR_SHIFT_START_RADIUS: 20.0,
    BLACKHOLE_MAX_PULL_FACTOR: 5.0
};

export const CAMERA_CONFIG = {
    FOV: 75,
    NEAR: 0.1,
    FAR: 1000,
    INITIAL_DISTANCE: 200,
    MIN_DISTANCE: 50,
    MAX_DISTANCE: 500,
    ROTATION_SPEED: 0.3,
    ZOOM_SPEED: 10
};

export const UI_CONFIG = {
    INPUT_LIMITS: {
        MAX_NUMBER: {
            MIN: 10,
            MAX: 10000,
            DEFAULT: 1000
        },
        LUCKY_NUMBERS: {
            MIN: 1,
            MAX: 100,
            DEFAULT: 6
        }
    },
    ANIMATION_EASING: {
        DURATION: 300,
        TIMING: 'cubic-bezier(0.4, 0, 0.2, 1)'
    }
};

export const DEBUG_CONFIG = {
    METRICS_UPDATE_INTERVAL: 500,  // ms
    PERFORMANCE_HISTORY_SIZE: 60,  // frames
    WARNING_THRESHOLD_MS: 16,      // 60fps = 16.67ms
    ERROR_THRESHOLD_MS: 33         // 30fps = 33.33ms
};
