// worker.js - Web Worker for particle physics updates
// Performance optimized with object pooling and typed arrays

// Pre-allocate typed arrays for better performance
let particlePositions = null;
let particleVelocities = null;
let selectedIndices = null;

// Constants for physics calculations
const PARTICLE_STRIDE = 3; // x, y, z components per particle

// Create a shared buffer for transferring data
let sharedParticleBuffer = null;

self.onmessage = function(e) {
    const { command, data } = e.data;

    switch (command) {
        case 'init':
            // Initialize typed arrays with the particle count
            const { particleCount } = data;
            initializeArrays(particleCount);
            break;

        case 'update':
            // Update particle physics
            const { params, phase, time, lineUpStartTime, lineUpDuration, dynamicTargetParticlePositions } = data;
            updateParticlePhysics(params, phase, time, lineUpStartTime, lineUpDuration, dynamicTargetParticlePositions);
            
            // Transfer the buffer back to the main thread
            self.postMessage({
                command: 'updated',
                positions: particlePositions.buffer,
                velocities: particleVelocities.buffer
            }, [particlePositions.buffer, particleVelocities.buffer]);
            break;

        case 'updateSelected':
            // Update selected particles array
            selectedIndices = new Uint32Array(data.selected);
            break;
    }
};

function initializeArrays(count) {
    particlePositions = new Float32Array(count * PARTICLE_STRIDE);
    particleVelocities = new Float32Array(count * PARTICLE_STRIDE);
    selectedIndices = new Uint32Array(0);
}

function updateParticlePhysics(params, phase, time, lineUpStartTime, lineUpDuration, dynamicTargetParticlePositions) {
    const particleCount = particlePositions.length / PARTICLE_STRIDE;
    const center = [0, 0, 0];

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
                applySwirlPhysics(baseIndex, params, center);
                break;
            case 'clashing':
                if (isSelected) {
                    applyClashPhysics(baseIndex, params, center);
                }
                break;
        }

        // Update positions and handle boundary collisions
        handleBoundaryCollisions(baseIndex, halfBox, params.particleRadius);
    }
}

function applyFloatingPhysics(baseIndex, params) {
    // Gentle floating motion with optimized calculations
    for (let d = 0; d < PARTICLE_STRIDE; d++) {
        particleVelocities[baseIndex + d] += 
            ((Math.random() - 0.5) * params.galacticRandomMotion * 0.5) +
            (params.peculiarVelocity[d] * 0.1);
        
        // Simplified cosmic expansion
        const pos = particlePositions[baseIndex + d];
        const expansionForce = (pos / Math.max(Math.abs(pos), 1)) * params.cosmicExpansionFactor * 0.1;
        particleVelocities[baseIndex + d] += expansionForce;
    }
}

function applySwirlPhysics(baseIndex, params, center) {
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
    direction[0] /= distance;
    direction[1] /= distance;
    direction[2] /= distance;

    // Apply forces
    for (let d = 0; d < PARTICLE_STRIDE; d++) {
        // Gravitational pull
        particleVelocities[baseIndex + d] -= direction[d] * distance * params.currentGravitationalPull;
        
        // Orbital velocity (simplified cross product with up vector)
        const tangentialForce = d === 0 ? direction[2] : (d === 2 ? -direction[0] : 0);
        particleVelocities[baseIndex + d] += tangentialForce * distance * params.currentOrbitalVelocityFactor;
        
        // Random motion
        particleVelocities[baseIndex + d] += (Math.random() - 0.5) * params.galacticRandomMotion;
    }
}

function applyClashPhysics(baseIndex, params, center) {
    const clashInwardForce = 0.005;
    for (let d = 0; d < PARTICLE_STRIDE; d++) {
        const toCenter = -particlePositions[baseIndex + d];
        particleVelocities[baseIndex + d] += toCenter * clashInwardForce;
    }
}

function handleBoundaryCollisions(baseIndex, halfBox, particleRadius) {
    // Update positions
    for (let d = 0; d < PARTICLE_STRIDE; d++) {
        particlePositions[baseIndex + d] += particleVelocities[baseIndex + d];
        
        // Boundary collisions
        if (particlePositions[baseIndex + d] + particleRadius > halfBox) {
            particleVelocities[baseIndex + d] *= -1;
            particlePositions[baseIndex + d] = halfBox - particleRadius;
        } else if (particlePositions[baseIndex + d] - particleRadius < -halfBox) {
            particleVelocities[baseIndex + d] *= -1;
            particlePositions[baseIndex + d] = -halfBox + particleRadius;
        }
    }
}
