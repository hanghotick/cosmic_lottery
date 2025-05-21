import { PARTICLE_CONFIG, ANIMATION_CONFIG, PHYSICS_CONFIG } from './config.js';

export class ParticleRenderer {
    constructor(scene, particleCount) {
        this.scene = scene;
        this.particleCount = particleCount;
        this.selectedIndices = new Set();
        this.phase = 0;
        this.phaseProgress = 0;
        this.phaseStartTime = 0;
        this.currentDuration = 0;
        this.targetPositions = new Map();
        this.initShaders();
    }

    async initShaders() {
        // Load shader files
        const vertexShader = await fetch('js/shaders/particle.vert').then(r => r.text());
        const fragmentShader = await fetch('js/shaders/particle.frag').then(r => r.text());

        // Create geometry with particle indices
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.particleCount * 3);
        const indices = new Float32Array(this.particleCount);

        for (let i = 0; i < this.particleCount; i++) {
            indices[i] = 0; // 0 for non-selected, 1 for selected
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('particleIndex', new THREE.BufferAttribute(indices, 1));

        // Create shader material
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                center: { value: new THREE.Vector3(0, 0, 0) },
                phase: { value: 0 },
                phaseProgress: { value: 0 },
                targetPosition: { value: new THREE.Vector3() },
                color: { value: new THREE.Color().setHSL(
                    PARTICLE_CONFIG.COLOR.HUE / 360,
                    PARTICLE_CONFIG.COLOR.SATURATION / 100,
                    PARTICLE_CONFIG.COLOR.LIGHTNESS / 100
                )}
            },
            vertexShader,
            fragmentShader,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        // Create points system
        this.particles = new THREE.Points(geometry, this.material);
        this.scene.add(this.particles);
    }

    setPhase(newPhase, duration) {
        this.phase = newPhase;
        this.phaseStartTime = performance.now();
        this.currentDuration = duration;
        this.material.uniforms.phase.value = newPhase;
    }

    setTargetPosition(index, position) {
        this.targetPositions.set(index, position);
    }

    update(time) {
        if (!this.material) return;

        // Update time uniform
        this.material.uniforms.time.value = time * 0.001;

        // Update phase progress
        if (this.currentDuration > 0) {
            const elapsed = time - this.phaseStartTime;
            this.phaseProgress = Math.min(1, elapsed / this.currentDuration);
            this.material.uniforms.phaseProgress.value = this.phaseProgress;
        }

        // Update target positions for selected particles
        if (this.selectedIndices.size > 0 && this.phase >= 3) {
            for (const [index, position] of this.targetPositions) {
                if (this.selectedIndices.has(index)) {
                    this.material.uniforms.targetPosition.value.copy(position);
                    break; // Only need one position for now
                }
            }
        }
    }

    updatePositions(positions) {
        if (!this.particles) return;
        
        const positionAttribute = this.particles.geometry.attributes.position;
        positionAttribute.array.set(positions);
        positionAttribute.needsUpdate = true;
    }

    updateSelection(selectedIndices) {
        if (!this.particles) return;

        const indexAttribute = this.particles.geometry.attributes.particleIndex;
        const indices = indexAttribute.array;

        // Reset all indices to 0 (non-selected)
        indices.fill(0);

        // Set selected particles to 1
        for (const index of selectedIndices) {
            indices[index] = 1;
        }

        indexAttribute.needsUpdate = true;
    }

    updateTime(time) {
        if (this.material) {
            this.material.uniforms.time.value = time;
        }
    }

    dispose() {
        if (this.particles) {
            this.scene.remove(this.particles);
            this.particles.geometry.dispose();
            this.particles.material.dispose();
            this.particles = null;
        }
    }
}
