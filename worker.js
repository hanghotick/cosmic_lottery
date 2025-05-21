// worker.js - Web Worker for particle physics updates

self.onmessage = function(e) {
    const { particles, params, phase, selectedIndices, time, lineUpStartTime, lineUpDuration, dynamicTargetParticlePositions } = e.data;
    // particles: Array of { position: [x,y,z], velocity: [x,y,z] }
    // params: { ...physics params... }
    // phase: 'floating' | 'swirling' | 'clashing' | 'liningUp'
    // selectedIndices: array of indices of selected particles
    // time: current time (ms)
    // lineUpStartTime, lineUpDuration, dynamicTargetParticlePositions: for lining up

    const updatedParticles = particles.map((p, i) => {
        let pos = [...p.position];
        let vel = [...p.velocity];
        const isSelected = selectedIndices.includes(i);
        const center = [0,0,0];
        // Damping
        vel = vel.map(v => v * params.damping);
        if (phase === 'floating' || phase === 'swirling') {
            for (let d=0; d<3; d++) {
                vel[d] += (Math.random() - 0.5) * params.galacticRandomMotion;
                vel[d] += params.peculiarVelocity[d];
            }
            // Cosmic expansion
            const dist = Math.sqrt(pos[0]**2 + pos[1]**2 + pos[2]**2) || 1;
            for (let d=0; d<3; d++) {
                vel[d] += (pos[d]/dist) * params.cosmicExpansionFactor;
            }
        } else if (phase === 'clashing') {
            // Inward pull
            const dist = Math.sqrt(pos[0]**2 + pos[1]**2 + pos[2]**2) || 1;
            for (let d=0; d<3; d++) {
                vel[d] += (-pos[d]/dist) * params.clashInwardForce;
            }
        } else if (phase === 'liningUp' && isSelected) {
            // Interpolate to target
            const elapsed = time - lineUpStartTime;
            let t = Math.min(1, elapsed / lineUpDuration);
            const target = dynamicTargetParticlePositions[i];
            for (let d=0; d<3; d++) {
                pos[d] = pos[d] + (target[d] - pos[d]) * t;
                vel[d] = 0;
            }
        }
        // Add velocity to position
        for (let d=0; d<3; d++) pos[d] += vel[d];
        // Boundary collision
        const halfBox = params.boxSize / 2;
        for (let d=0; d<3; d++) {
            if (pos[d] + params.particleRadius > halfBox) {
                vel[d] *= -1;
                pos[d] = halfBox - params.particleRadius;
            } else if (pos[d] - params.particleRadius < -halfBox) {
                vel[d] *= -1;
                pos[d] = -halfBox + params.particleRadius;
            }
        }
        return { position: pos, velocity: vel };
    });
    self.postMessage({ particles: updatedParticles });
};
