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

    // Transition factors for smooth animations
    let transitionFactor = 1;
    if (phase === 'clashing') {
        transitionFactor = Math.min(1, (time - params.clashStartTime) / params.explosionDuration);
    } else if (phase === 'liningUp') {
        transitionFactor = Math.min(1, (time - lineUpStartTime) / lineUpDuration);
    }
    
    // Update each particle
    for (let i = 0; i < particleCount; i++) {
        const baseIndex = i * PARTICLE_STRIDE;
        const isSelected = selectedIndices.includes(i);

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
                    applyClashPhysics(baseIndex, params, center, transitionFactor);
                } else {
                    // Non-selected particles fade away
                    applyFadeAwayPhysics(baseIndex, params, transitionFactor);
                }
                break;

            case 'liningUp':
                if (isSelected) {
                    applyLineUpPhysics(baseIndex, i, params, dynamicTargetParticlePositions, transitionFactor);
                }
                break;
        }

        // Update positions and handle boundary collisions
        handleBoundaryCollisions(baseIndex, halfBox, params.particleRadius);
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
    for (let d = 0; d < PARTICLE_STRIDE; d++) {
        direction[d] /= distance;
    }

    // Enhanced swirl effect
    for (let d = 0; d < PARTICLE_STRIDE; d++) {
        // Stronger gravitational pull
        particleVelocities[baseIndex + d] -= direction[d] * distance * params.currentGravitationalPull * 1.5;
        
        // Enhanced orbital velocity with vertical component
        const tangentialForce = d === 0 ? direction[2] : (d === 2 ? -direction[0] : direction[1] * 0.5);
        particleVelocities[baseIndex + d] += tangentialForce * distance * params.currentOrbitalVelocityFactor * 1.2;
        
        // Controlled random motion for visual interest
        particleVelocities[baseIndex + d] += (Math.random() - 0.5) * params.galacticRandomMotion * 0.8;
    }
}

function applyClashPhysics(baseIndex, params, center, transitionFactor) {
    const clashForce = 0.008 * transitionFactor;
    const randomSpread = 0.002 * (1 - transitionFactor);

    for (let d = 0; d < PARTICLE_STRIDE; d++) {
        const toCenter = center[d] - particlePositions[baseIndex + d];
        particleVelocities[baseIndex + d] += toCenter * clashForce;
        particleVelocities[baseIndex + d] += (Math.random() - 0.5) * randomSpread;
    }
}

function applyFadeAwayPhysics(baseIndex, params, transitionFactor) {
    // Particles spiral outward and fade
    const spiralForce = 0.01 * transitionFactor;
    const outwardForce = 0.005 * transitionFactor;

    for (let d = 0; d < PARTICLE_STRIDE; d++) {
        const pos = particlePositions[baseIndex + d];
        const spiral = d === 0 ? pos : (d === 2 ? -pos : 0);
        particleVelocities[baseIndex + d] += spiral * spiralForce;
        particleVelocities[baseIndex + d] += pos * outwardForce;
    }
}

function applyLineUpPhysics(baseIndex, particleIndex, params, targetPositions, transitionFactor) {
    if (!targetPositions || particleIndex >= targetPositions.length) return;

    const target = targetPositions[particleIndex];
    const lineUpForce = 0.1 * transitionFactor;
    const stabilizationForce = 0.02 * transitionFactor;

    for (let d = 0; d < PARTICLE_STRIDE; d++) {
        const toTarget = (target[d] || 0) - particlePositions[baseIndex + d];
        particleVelocities[baseIndex + d] += toTarget * lineUpForce;
        particleVelocities[baseIndex + d] *= (1 - stabilizationForce); // Dampen velocity for stability
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
