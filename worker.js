// worker.js - Web Worker for particle physics updates
// Performance optimized with object pooling and typed arrays

// Pre-allocate typed arrays for better performance
let particlePositions = null;
let particleVelocities = null;
let selectedIndices = null;
let sharedBuffer = null;

// Constants for physics calculations
const PARTICLE_STRIDE = 3; // x, y, z components per particle
const VALIDATION_ERROR = 'validation_error';
const PHASE = {
    IDLE: 'idle',
    ORBITING: 'orbiting',
    SELECTION: 'selection',
    TRANSITION: 'transition',
    FINALE: 'finale'
};

// Easing functions for smooth transitions
const easing = {
    easeInCubic: t => t * t * t,
    easeOutCubic: t => 1 - Math.pow(1 - t, 3),
    easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    easeInExpo: t => t === 0 ? 0 : Math.pow(2, 10 * t - 10)
};

let currentPhase = PHASE.IDLE;
let isProcessing = false; // Prevent concurrent updates
let frameCount = 0;

// Enhanced message validation helper with type checking
function validateMessage(data, requiredProps) {
    if (!data || typeof data !== 'object') {
        throw new Error('Invalid message data');
    }
    
    for (const prop of requiredProps) {
        if (!(prop in data)) {
            throw new Error(`Missing required property: ${prop}`);
        }
    }
}

// Buffer management
function createBuffers(count) {
    const totalSize = count * PARTICLE_STRIDE * Float32Array.BYTES_PER_ELEMENT;
    sharedBuffer = new SharedArrayBuffer(totalSize * 2); // For positions and velocities
    
    particlePositions = new Float32Array(sharedBuffer, 0, count * PARTICLE_STRIDE);
    particleVelocities = new Float32Array(sharedBuffer, totalSize, count * PARTICLE_STRIDE);
    selectedIndices = new Uint32Array(0);
    
    return {
        positions: particlePositions,
        velocities: particleVelocities
    };
}

self.onmessage = function(e) {
    if (isProcessing) {
        console.warn('Dropping message, still processing previous update');
        return;
    }

    try {
        const { command, data } = e.data;
        isProcessing = true;

        switch (command) {
            case 'init':
                validateMessage(data, ['particleCount']);
                const buffers = createBuffers(data.particleCount);
                currentPhase = PHASE.IDLE;
                frameCount = 0;
                
                self.postMessage({
                    command: 'initialized',
                    buffers: sharedBuffer
                });
                break;

            case 'update':
                validateMessage(data, ['params', 'phase', 'time']);
                
                if (data.phase !== currentPhase) {
                    handlePhaseTransition(currentPhase, data.phase, data.params);
                    currentPhase = data.phase;
                }
                
                updateParticlePhysics(
                    data.params,
                    data.phase,
                    data.time,
                    data.lineUpStartTime,
                    data.lineUpDuration,
                    data.dynamicTargetParticlePositions
                );
                
                frameCount++;
                
                // Send update confirmation
                self.postMessage({
                    command: 'updated',
                    phase: currentPhase,
                    frame: frameCount
                });
                break;

            case 'updateSelected':
                validateMessage(data, ['selected']);
                if (!Array.isArray(data.selected)) {
                    throw new Error('Selected particles must be an array');
                }
                selectedIndices = new Uint32Array(data.selected);
                applySelectionEffects(data.selected, data.params);
                break;

            case 'reset':
                resetSimulation();
                break;

            default:
                throw new Error(`Unknown command: ${command}`);
        }
    } catch (error) {
        console.error('Worker error:', error);
        self.postMessage({
            command: VALIDATION_ERROR,
            error: error.message
        });
    } finally {
        isProcessing = false;
    }
};

function handlePhaseTransition(oldPhase, newPhase, params) {
    // Save current state for smooth transitions
    const prevPositions = new Float32Array(particlePositions);
    const prevVelocities = new Float32Array(particleVelocities);
    
    switch (newPhase) {
        case PHASE.ORBITING:
            initializeOrbitalPositions(params);
            break;
            
        case PHASE.SELECTION:
            prepareForSelection(prevPositions, params);
            break;
            
        case PHASE.FINALE:
            initializeFinaleFormation(params);
            break;
            
        case PHASE.IDLE:
            resetParticleState();
            break;
    }
}

function resetSimulation() {
    if (particlePositions) {
        particlePositions.fill(0);
        particleVelocities.fill(0);
    }
    selectedIndices = new Uint32Array(0);
    currentPhase = PHASE.IDLE;
    frameCount = 0;
    
    self.postMessage({
        command: 'reset_complete'
    });
}

// Helper functions for phase transitions
function initializeOrbitalPositions(params) {
    // Initialize particles in orbital formation
    const count = particlePositions.length / PARTICLE_STRIDE;
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const radius = params.orbitRadius || 50;
        
        const idx = i * PARTICLE_STRIDE;
        particlePositions[idx] = Math.cos(angle) * radius;
        particlePositions[idx + 1] = Math.sin(angle) * radius;
        particlePositions[idx + 2] = 0;
        
        // Add slight random velocity for natural movement
        particleVelocities[idx] = (Math.random() - 0.5) * 0.1;
        particleVelocities[idx + 1] = (Math.random() - 0.5) * 0.1;
        particleVelocities[idx + 2] = (Math.random() - 0.5) * 0.1;
    }
}

function prepareForSelection(prevPositions, params) {
    const count = particlePositions.length / PARTICLE_STRIDE;
    for (let i = 0; i < count; i++) {
        const idx = i * PARTICLE_STRIDE;
        // Maintain previous positions but reduce velocities
        particlePositions[idx] = prevPositions[idx];
        particlePositions[idx + 1] = prevPositions[idx + 1];
        particlePositions[idx + 2] = prevPositions[idx + 2];
        
        particleVelocities[idx] *= 0.5;
        particleVelocities[idx + 1] *= 0.5;
        particleVelocities[idx + 2] *= 0.5;
    }
}

function initializeFinaleFormation(params) {
    // Position selected particles in a special formation
    if (!selectedIndices || selectedIndices.length === 0) return;
    
    selectedIndices.forEach((particleIdx, i) => {
        const idx = particleIdx * PARTICLE_STRIDE;
        const angle = (i / selectedIndices.length) * Math.PI * 2;
        const radius = params.finaleRadius || 30;
        
        particlePositions[idx] = Math.cos(angle) * radius;
        particlePositions[idx + 1] = Math.sin(angle) * radius;
        particlePositions[idx + 2] = 10; // Slightly elevated
        
        // Clear velocities for stable formation
        particleVelocities[idx] = 0;
        particleVelocities[idx + 1] = 0;
        particleVelocities[idx + 2] = 0;
    });
}

function resetParticleState() {
    particlePositions.fill(0);
    particleVelocities.fill(0);
}

function applySelectionEffects(selectedParticles, params) {
    const glowIntensity = params?.glowIntensity || 1.0;
    selectedParticles.forEach(index => {
        const idx = index * PARTICLE_STRIDE;
        // Add upward velocity and glow effect
        particleVelocities[idx + 2] += 0.5 * glowIntensity;
    });
}

function initializeArrays(count) {
    particlePositions = new Float32Array(count * PARTICLE_STRIDE);
    particleVelocities = new Float32Array(count * PARTICLE_STRIDE);
    selectedIndices = new Uint32Array(0);
}

function updateParticlePhysics(params, phase, time, lineUpStartTime, lineUpDuration, dynamicTargetParticlePositions) {
    const particleCount = particlePositions.length / PARTICLE_STRIDE;
    const center = [0, 0, 0];

    // Calculate phase-specific parameters with easing
    let currentGravity = params.gravitationalPull;
    let currentOrbital = params.orbitalVelocityFactor;

    if (phase === 'blackhole') {
        const progress = Math.min(1, (time - params.blackholeStartTime) / params.blackholeDuration);
        const easeValue = easing.easeInExpo(progress);
        
        // Dramatically increase forces during blackhole phase
        currentGravity = params.gravitationalPull + 
            (params.maxGravitationalPull - params.gravitationalPull) * easeValue;
        currentOrbital = params.orbitalVelocityFactor + 
            (params.maxOrbitalVelocityFactor - params.orbitalVelocityFactor) * easeValue;
    }

    // Pre-calculate common values
    const halfBox = params.boxSize / 2;
    const peculiarDelta = (Math.random() - 0.5) * params.peculiarVelocityChangeRate;
    
    // Update each particle
    for (let i = 0; i < particleCount; i++) {
        const baseIndex = i * PARTICLE_STRIDE;
        const isSelected = selectedIndices.includes(i);

        // Skip selected particles during lineup phase
        if (phase === 'liningUp' && isSelected) continue;

        // Apply damping to velocity
        for (let d = 0; d < PARTICLE_STRIDE; d++) {
            particleVelocities[baseIndex + d] *= params.damping;
        }

        // Phase-specific physics
        switch (phase) {
            case 'floating':
                applyFloatingPhysics(baseIndex, params);
                break;
            case 'swirling':
                applySwirlPhysics(baseIndex, params, center, currentGravity, currentOrbital);
                break;
            case 'blackhole':
                applyBlackholePhysics(baseIndex, params, center, currentGravity, currentOrbital);
                break;
            case 'clashing':
                applyClashPhysics(baseIndex, params, center, isSelected);
                break;
        }

        // Handle boundary collisions with fadeout for non-selected particles
        if (phase === 'blackhole' || phase === 'clashing') {
            handleBlackholeCollisions(baseIndex, halfBox, params.particleRadius, isSelected);
        } else {
            handleBoundaryCollisions(baseIndex, halfBox, params.particleRadius);
        }
    }
}

function applyFloatingPhysics(baseIndex, params) {
    // Enhanced floating motion with smoother transitions
    const randomForce = Math.random() * 2 - 1;
    const baseForce = params.galacticRandomMotion * 0.3;

    for (let d = 0; d < PARTICLE_STRIDE; d++) {
        // Add smooth random motion
        particleVelocities[baseIndex + d] += 
            (randomForce * baseForce) +
            (params.peculiarVelocity[d] * 0.1);
        
        // Enhanced cosmic expansion with distance-based scaling
        const pos = particlePositions[baseIndex + d];
        const distanceFromCenter = Math.abs(pos);
        const scaledExpansion = params.cosmicExpansionFactor * (distanceFromCenter / params.boxSize);
        particleVelocities[baseIndex + d] += pos * scaledExpansion;
    }
}

function applySwirlPhysics(baseIndex, params, center, currentGravity, currentOrbital) {
    // Calculate direction and distance from center
    const pos = [
        particlePositions[baseIndex],
        particlePositions[baseIndex + 1],
        particlePositions[baseIndex + 2]
    ];
    
    const direction = [
        pos[0] - center[0],
        pos[1] - center[1],
        pos[2] - center[2]
    ];
    
    const distance = Math.sqrt(
        direction[0] * direction[0] +
        direction[1] * direction[1] +
        direction[2] * direction[2]
    ) || 1;

    // Normalize direction
    for (let d = 0; d < PARTICLE_STRIDE; d++) {
        direction[d] /= distance;
    }

    // Enhanced swirl effect
    for (let d = 0; d < PARTICLE_STRIDE; d++) {
        // Stronger gravitational pull
        particleVelocities[baseIndex + d] -= direction[d] * distance * currentGravity * 1.5;
        
        // Enhanced orbital velocity with vertical component
        const tangentialForce = d === 0 ? direction[2] : (d === 2 ? -direction[0] : direction[1] * 0.5);
        particleVelocities[baseIndex + d] += tangentialForce * distance * currentOrbital * 1.2;
        
        // Controlled random motion for visual interest
        particleVelocities[baseIndex + d] += (Math.random() - 0.5) * params.galacticRandomMotion * 0.8;
    }
}

function applyBlackholePhysics(baseIndex, params, center, currentGravity, currentOrbital) {
    const pos = [
        particlePositions[baseIndex],
        particlePositions[baseIndex + 1],
        particlePositions[baseIndex + 2]
    ];
    
    const direction = [
        pos[0] - center[0],
        pos[1] - center[1],
        pos[2] - center[2]
    ];
    
    const distance = Math.sqrt(
        direction[0] * direction[0] +
        direction[1] * direction[1] +
        direction[2] * direction[2]
    ) || 1;

    // Normalize direction and apply intensified gravitational pull
    for (let d = 0; d < PARTICLE_STRIDE; d++) {
        direction[d] /= distance;
        // Stronger inward pull
        particleVelocities[baseIndex + d] -= direction[d] * distance * currentGravity * 2;
        
        // Enhanced orbital velocity
        const tangentialForce = d === 0 ? direction[2] : (d === 2 ? -direction[0] : 0);
        particleVelocities[baseIndex + d] += tangentialForce * distance * currentOrbital * 1.5;
        
        // Add some chaos
        particleVelocities[baseIndex + d] += (Math.random() - 0.5) * params.galacticRandomMotion * 2;
    }
}

function applyClashPhysics(baseIndex, params, center, isSelected) {
    const clashForce = 0.008;
    const randomSpread = 0.002;

    for (let d = 0; d < PARTICLE_STRIDE; d++) {
        const toCenter = center[d] - particlePositions[baseIndex + d];
        particleVelocities[baseIndex + d] += toCenter * clashForce;
        particleVelocities[baseIndex + d] += (Math.random() - 0.5) * randomSpread;
    }
}

function handleBlackholeCollisions(baseIndex, halfBox, particleRadius, isSelected) {
    const distanceToCenter = Math.sqrt(
        particlePositions[baseIndex] * particlePositions[baseIndex] +
        particlePositions[baseIndex + 1] * particlePositions[baseIndex + 1] +
        particlePositions[baseIndex + 2] * particlePositions[baseIndex + 2]
    );

    // If particle gets too close to center and isn't selected, gradually fade it out
    if (!isSelected && distanceToCenter < halfBox * 0.1) {
        // Fade out by reducing velocity
        for (let d = 0; d < PARTICLE_STRIDE; d++) {
            particleVelocities[baseIndex + d] *= 0.95;
        }
    }

    // Normal boundary handling
    for (let d = 0; d < PARTICLE_STRIDE; d++) {
        particlePositions[baseIndex + d] += particleVelocities[baseIndex + d];
        
        if (particlePositions[baseIndex + d] + particleRadius > halfBox) {
            particleVelocities[baseIndex + d] *= -0.8; // Reduced bounce for more dramatic effect
            particlePositions[baseIndex + d] = halfBox - particleRadius;
        } else if (particlePositions[baseIndex + d] - particleRadius < -halfBox) {
            particleVelocities[baseIndex + d] *= -0.8;
            particlePositions[baseIndex + d] = -halfBox + particleRadius;
        }
    }
}

function handleBoundaryCollisions(baseIndex, halfBox, particleRadius) {
    const bounceFactor = 0.8; // Slightly inelastic collisions for more natural behavior

    for (let d = 0; d < PARTICLE_STRIDE; d++) {
        // Update position
        particlePositions[baseIndex + d] += particleVelocities[baseIndex + d];
        
        // Enhanced boundary collisions with smoother bouncing
        if (particlePositions[baseIndex + d] + particleRadius > halfBox) {
            particleVelocities[baseIndex + d] *= -bounceFactor;
            particlePositions[baseIndex + d] = halfBox - particleRadius;
        } else if (particlePositions[baseIndex + d] - particleRadius < -halfBox) {
            particleVelocities[baseIndex + d] *= -bounceFactor;
            particlePositions[baseIndex + d] = -halfBox + particleRadius;
        }
    }
}
