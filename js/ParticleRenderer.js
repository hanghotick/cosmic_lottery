import { PARTICLE_CONFIG } from './config.js';

/**
 * Handles particle system rendering using instanced meshes
 */
export class ParticleRenderer {
    constructor(scene, particleCount) {
        this.scene = scene;
        this.particleCount = Math.min(particleCount, PARTICLE_CONFIG.MAX_COUNT);
        
        // Core rendering components
        this.instancedMesh = null;
        this.material = null;
        this.dummy = new THREE.Object3D(); // For instance updates
        
        // Attribute arrays
        this.positions = new Float32Array(this.particleCount * 3);
        this.colors = new Float32Array(this.particleCount * 3);
        this.scales = new Float32Array(this.particleCount);
        
        // Selection state
        this.selectedIndices = new Set();
        
        // Phase state
        this.currentPhase = 0;
        this.phaseProgress = 0;
        this.phaseStartTime = 0;
        this.phaseDuration = 0;
    }

    /**
     * Initialize particle system with shaders
     */
    async initShaders() {
        try {
            // Load shader files with timeout and error handling
            const loadShader = async (path) => {
                const response = await fetch(path);
                if (!response.ok) {
                    throw new Error(`Failed to load shader: ${path} (${response.status} ${response.statusText})`);
                }
                return response.text();
            };

            const [vertexShader, fragmentShader] = await Promise.all([
                loadShader('js/shaders/particle.vert'),
                loadShader('js/shaders/particle.frag')
            ]);

            // Validate shader content
            if (!vertexShader || !fragmentShader) {
                throw new Error('Shader content is empty');
            }

            // Create shader material with error catching
            try {
                this.material = new THREE.ShaderMaterial({
                    uniforms: {
                        time: { value: 0 },
                        phase: { value: 0 },
                        phaseProgress: { value: 0 },
                        center: { value: new THREE.Vector3(0, 0, 0) }
                    },
                    vertexShader,
                    fragmentShader,
                    transparent: true,
                    depthWrite: false,
                    blending: THREE.AdditiveBlending
                });
            } catch (error) {
                throw new Error(`Failed to create shader material: ${error.message}`);
            }

            // Create base geometry for particles
            try {
                const geometry = new THREE.SphereGeometry(PARTICLE_CONFIG.RADIUS, 8, 8);
                
                // Create instanced mesh
                this.instancedMesh = new THREE.InstancedMesh(
                    geometry,
                    this.material,
                    this.particleCount
                );
                
                // Initialize instance attributes
                this.initializeInstances();
                
                // Add to scene
                this.scene.add(this.instancedMesh);
            } catch (error) {
                throw new Error(`Failed to create particle geometry: ${error.message}`);
            }

            return true;
        } catch (error) {
            console.error('Shader initialization failed:', error);
            throw error;
        }
    }

    /**
     * Initialize instance attributes
     */
    initializeInstances() {
        const color = new THREE.Color();
        const boxSize = PARTICLE_CONFIG.RADIUS * 2;
        
        for (let i = 0; i < this.particleCount; i++) {
            // Random position within box
            this.dummy.position.set(
                (Math.random() - 0.5) * boxSize,
                (Math.random() - 0.5) * boxSize,
                (Math.random() - 0.5) * boxSize
            );
            
            // Random scale
            const scale = 0.8 + Math.random() * 0.4;
            this.dummy.scale.set(scale, scale, scale);
            
            // Update matrix
            this.dummy.updateMatrix();
            this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
            
            // Set initial color
            color.setHSL(
                PARTICLE_CONFIG.COLOR.HUE / 360,
                PARTICLE_CONFIG.COLOR.SATURATION / 100,
                PARTICLE_CONFIG.COLOR.LIGHTNESS / 100
            );
            this.instancedMesh.setColorAt(i, color);
        }
        
        this.instancedMesh.instanceMatrix.needsUpdate = true;
        this.instancedMesh.instanceColor.needsUpdate = true;
    }

    /**
     * Update particle positions from physics simulation
     */
    updatePositions(positions) {
        if (!this.instancedMesh) return;

        for (let i = 0; i < this.particleCount; i++) {
            this.dummy.position.set(
                positions[i * 3],
                positions[i * 3 + 1],
                positions[i * 3 + 2]
            );
            
            // Scale selected particles slightly larger
            const scale = this.selectedIndices.has(i) ? 1.5 : 1.0;
            this.dummy.scale.set(scale, scale, scale);
            
            this.dummy.updateMatrix();
            this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
        }

        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }

    /**
     * Update selected particles
     */
    updateSelection(selectedIndices) {
        if (!this.instancedMesh) return;

        this.selectedIndices = new Set(selectedIndices);
        const color = new THREE.Color();
        
        for (let i = 0; i < this.particleCount; i++) {
            const isSelected = this.selectedIndices.has(i);
            
            // Set color based on selection
            if (isSelected) {
                color.setHSL(0.15, 1.0, 0.7); // Gold color for selected
            } else {
                color.setHSL(
                    PARTICLE_CONFIG.COLOR.HUE / 360,
                    PARTICLE_CONFIG.COLOR.SATURATION / 100,
                    PARTICLE_CONFIG.COLOR.LIGHTNESS / 100
                );
            }
            
            this.instancedMesh.setColorAt(i, color);
        }
        
        this.instancedMesh.instanceColor.needsUpdate = true;
    }

    /**
     * Set current animation phase
     */
    setPhase(phase, duration) {
        this.currentPhase = phase;
        this.phaseStartTime = performance.now();
        this.phaseDuration = duration;
        
        if (this.material) {
            this.material.uniforms.phase.value = phase;
        }
    }

    /**
     * Update time uniforms
     */
    updateTime(time) {
        if (!this.material) return;

        this.material.uniforms.time.value = time;
        
        if (this.phaseDuration > 0) {
            const progress = Math.min(1, (performance.now() - this.phaseStartTime) / this.phaseDuration);
            this.material.uniforms.phaseProgress.value = progress;
        }
    }

    /**
     * Reset particle system
     */
    resetParticles() {
        if (!this.instancedMesh) return;

        // Reset phase state
        this.currentPhase = 0;
        this.phaseProgress = 0;
        this.phaseStartTime = 0;
        this.phaseDuration = 0;
        
        // Reset selection state
        this.selectedIndices.clear();
        
        // Reinitialize instances
        this.initializeInstances();
        
        // Reset uniforms
        if (this.material) {
            this.material.uniforms.phase.value = 0;
            this.material.uniforms.phaseProgress.value = 0;
            this.material.uniforms.time.value = 0;
        }
    }

    /**
     * Clean up resources
     */
    dispose() {
        if (this.instancedMesh) {
            this.scene.remove(this.instancedMesh);
            this.instancedMesh.geometry.dispose();
            this.instancedMesh.material.dispose();
            this.instancedMesh = null;
        }
    }

    /**
     * Get particle count
     */
    getParticleCount() {
        return this.particleCount;
    }
}
