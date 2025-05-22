// SimulationController.js - Handles simulation state and physics updates
import { ANIMATION_CONFIG, PHYSICS_CONFIG } from './config.js';

/**
 * Controls the simulation state and physics updates
 */
export class SimulationController {
    constructor(debug, particleRenderer, webglManager, ui) {
        this.debug = debug;
        this.particleRenderer = particleRenderer;
        this.webglManager = webglManager;
        this.ui = ui;
        
        // Worker and update handling
        this.worker = null;
        this.isProcessing = false;
        this.lastUpdateTime = 0;
        this.UPDATE_INTERVAL = 16; // ~60fps
        this.sharedBuffer = null;

        // Simulation state
        this.currentPhase = ANIMATION_CONFIG.PHASES.FLOATING;
        this.phaseStartTime = 0;
        this.selectedIndices = new Set();
        this.selectedParticleMeshes = new Map(); // Map<number, THREE.Mesh>
        this.simulationStarted = false;
        this.luckyParticleSelected = false;
        
        // Physics state
        this.particlePositions = null;
        this.particleVelocities = null;

        // Phase-specific state
        this.blackholeStartTime = 0;
        this.clashStartTime = 0;
        this.lineUpStartTime = 0;
        this.lineUpDuration = ANIMATION_CONFIG.DURATIONS.LINE_UP;
        this.targetPositions = new Map(); // Map<number, THREE.Vector3>

        this.debug.track('SimulationController', 'Created');
    }

    /**
     * Start the simulation
     */
    startSimulation(maxNumber, numLuckyNumbers) {
        if (this.simulationStarted) return;

        this.simulationStarted = true;
        this.currentPhase = ANIMATION_CONFIG.PHASES.FLOATING;
        this.phaseStartTime = performance.now();
        this.luckyParticleCount = numLuckyNumbers;

        // Initialize particle data
        const particleCount = maxNumber;
        const totalSize = particleCount * 3 * Float32Array.BYTES_PER_ELEMENT;
        this.sharedBuffer = new SharedArrayBuffer(totalSize * 2);
        
        this.particlePositions = new Float32Array(this.sharedBuffer, 0, particleCount * 3);
        this.particleVelocities = new Float32Array(this.sharedBuffer, totalSize, particleCount * 3);

        // Initialize worker with particle data
        this.initializeWorker(particleCount);

        // Update UI
        this.ui.updateButtonStates(true);
        this.ui.showLoading(false);

        this.debug.track('Simulation', 'Started with shared buffer');
    }

    /**
     * Initialize the worker
     */
    initializeWorker(particleCount) {
        // Clean up existing worker
        if (this.worker) {
            this.worker.terminate();
        }

        this.worker = new Worker('worker.js');
        this.worker.onmessage = this.handleWorkerMessage.bind(this);

        // Send initial setup
        this.worker.postMessage({
            command: 'init',
            data: {
                particleCount,
                sharedBuffer: this.sharedBuffer
            }
        });

        this.debug.track('Worker', 'Initialized with shared buffer');
    }

    /**
     * Handle worker messages
     */
    handleWorkerMessage(e) {
        const { command, error, phase, frame } = e.data;

        if (error) {
            if (command === 'validation_error') {
                this.debug.track('Worker Validation Error', error);
                return;
            }
            this.handleWorkerError(error);
            return;
        }

        switch (command) {
            case 'initialized':
                this.debug.track('Worker', 'Initialization confirmed');
                break;

            case 'updated':
                // The data is already in our shared buffer, just update visuals
                this.updateParticleVisuals();
                
                // Handle phase transitions
                if (phase !== this.currentPhase) {
                    this.handlePhaseChange(phase);
                }
                
                // Update debug info
                this.debug.track('Frame', frame);
                break;

            case 'selected':
                this.handleParticleSelection(e.data.selected);
                break;

            case 'reset_complete':
                this.debug.track('Worker', 'Reset completed');
                break;
        }
    }

    /**
     * Handle worker errors
     */
    handleWorkerError(error) {
        this.debug.track('Worker Error', error);
        
        try {
            this.initializeWorker(this.particlePositions.length / 3);
        } catch (err) {
            this.debug.track('Worker Restart Failed', err.message);
            throw new Error('Failed to restart worker: ' + err.message);
        }
    }

    /**
     * Update particle visuals with new positions
     */
    updateParticleVisuals() {
        if (!this.particleRenderer) return;

        // Update particle positions in the shader
        this.particleRenderer.updatePositions(this.particlePositions);
        
        // Update selected particles
        if (this.selectedIndices.size > 0) {
            this.particleRenderer.updateSelection(this.selectedIndices);
        }

        // Update meshes for selected particles
        for (const [index, mesh] of this.selectedParticleMeshes) {
            const idx = index * 3;
            mesh.position.set(
                this.particlePositions[idx],
                this.particlePositions[idx + 1],
                this.particlePositions[idx + 2]
            );
        }

        // Update time uniform for animations
        this.particleRenderer.updateTime(performance.now() * 0.001);
    }

    /**
     * Handle phase change
     */
    handlePhaseChange(newPhase) {
        this.setPhase(newPhase);
        if (newPhase === ANIMATION_CONFIG.PHASES.SELECTION && !this.luckyParticleSelected) {
            this.startLuckyDraw(this.luckyParticleCount);
        }
    }

    /**
     * Update simulation state
     */
    async update(timestamp) {
        if (!this.worker || this.isProcessing || 
            timestamp - this.lastUpdateTime < this.UPDATE_INTERVAL) {
            return;
        }

        this.lastUpdateTime = timestamp;
        this.isProcessing = true;

        try {
            // Update phase transitions
            this.updatePhase(timestamp);

            // Update physics parameters
            const updateParams = {
                ...PHYSICS_CONFIG,
                ...this.getCurrentPhaseParams(),
                blackholeStartTime: this.blackholeStartTime,
                blackholeDuration: ANIMATION_CONFIG.DURATIONS.BLACKHOLE,
                clashStartTime: this.clashStartTime,
                lineUpStartTime: this.lineUpStartTime,
                lineUpDuration: this.lineUpDuration,
                selectedIndices: Array.from(this.selectedIndices),
                targetPositions: Array.from(this.targetPositions.entries())
            };

            // Send update to worker
            this.worker.postMessage({
                command: 'update',
                data: {
                    params: updateParams,
                    phase: this.currentPhase,
                    time: timestamp
                }
            });
            
            // Update UI progress
            const phaseProgress = this.calculatePhaseProgress(timestamp);
            this.ui.updateProgress(this.currentPhase, phaseProgress);
            
        } catch (error) {
            this.debug.track('Update Error', error.message);
            this.handleWorkerError(error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Calculate current phase progress
     */
    calculatePhaseProgress(timestamp) {
        const phase = this.currentPhase.toUpperCase();
        const duration = ANIMATION_CONFIG.DURATIONS[phase];
        if (!duration) return 0;
        
        const elapsed = timestamp - this.phaseStartTime;
        return Math.min(1, elapsed / duration);
    }

    /**
     * Get parameters for current phase
     */
    getCurrentPhaseParams() {
        switch (this.currentPhase) {
            case ANIMATION_CONFIG.PHASES.FLOATING:
                return {
                    gravitationalPull: PHYSICS_CONFIG.GRAVITY_BASE,
                    orbitalVelocityFactor: PHYSICS_CONFIG.ORBITAL_BASE,
                    damping: PHYSICS_CONFIG.DAMPING_BASE
                };

            case ANIMATION_CONFIG.PHASES.SWIRLING:
                return {
                    gravitationalPull: PHYSICS_CONFIG.GRAVITY_MAX,
                    orbitalVelocityFactor: PHYSICS_CONFIG.ORBITAL_MAX,
                    damping: PHYSICS_CONFIG.DAMPING_SWIRL
                };

            case ANIMATION_CONFIG.PHASES.BLACKHOLE:
                return {
                    gravitationalPull: PHYSICS_CONFIG.GRAVITY_BLACKHOLE,
                    orbitalVelocityFactor: 0,
                    damping: PHYSICS_CONFIG.DAMPING_MAX
                };

            case ANIMATION_CONFIG.PHASES.CLASHING:
                return {
                    gravitationalPull: PHYSICS_CONFIG.GRAVITY_MIN,
                    orbitalVelocityFactor: PHYSICS_CONFIG.ORBITAL_MIN,
                    damping: PHYSICS_CONFIG.DAMPING_CLASH
                };

            case ANIMATION_CONFIG.PHASES.SELECTION:
                return {
                    gravitationalPull: 0,
                    orbitalVelocityFactor: 0,
                    damping: PHYSICS_CONFIG.DAMPING_MAX
                };

            default:
                return {};
        }
    }

    /**
     * Update phase based on time
     */
    updatePhase(timestamp) {
        if (!this.simulationStarted) return;

        const progress = this.calculatePhaseProgress(timestamp);
        if (progress < 1) return;

        // Phase transitions
        switch (this.currentPhase) {
            case ANIMATION_CONFIG.PHASES.FLOATING:
                if (this.luckyParticleSelected) {
                    this.setPhase(ANIMATION_CONFIG.PHASES.SWIRLING);
                }
                break;

            case ANIMATION_CONFIG.PHASES.SWIRLING:
                if (timestamp >= this.blackholeStartTime) {
                    this.setPhase(ANIMATION_CONFIG.PHASES.BLACKHOLE);
                }
                break;

            case ANIMATION_CONFIG.PHASES.BLACKHOLE:
                this.setPhase(ANIMATION_CONFIG.PHASES.CLASHING);
                break;

            case ANIMATION_CONFIG.PHASES.CLASHING:
                if (timestamp - this.clashStartTime >= ANIMATION_CONFIG.DURATIONS.CLASH) {
                    this.setPhase(ANIMATION_CONFIG.PHASES.SELECTION);
                }
                break;

            case ANIMATION_CONFIG.PHASES.SELECTION:
                if (timestamp - this.lineUpStartTime >= this.lineUpDuration) {
                    this.setPhase(ANIMATION_CONFIG.PHASES.LINING_UP);
                }
                break;
        }
    }

    /**
     * Set current phase and handle transitions
     */
    setPhase(newPhase) {
        const now = performance.now();
        const oldPhase = this.currentPhase;
        this.currentPhase = newPhase;
        this.phaseStartTime = now;

        switch (newPhase) {
            case ANIMATION_CONFIG.PHASES.SWIRLING:
                this.blackholeStartTime = now + ANIMATION_CONFIG.DURATIONS.SWIRL;
                break;

            case ANIMATION_CONFIG.PHASES.BLACKHOLE:
                this.webglManager.setBlackholeVisibility(true);
                break;

            case ANIMATION_CONFIG.PHASES.CLASHING:
                this.clashStartTime = now;
                this.webglManager.setBlackholeVisibility(false);
                break;

            case ANIMATION_CONFIG.PHASES.LINING_UP:
                this.lineUpStartTime = now;
                break;
        }

        // Update particle renderer
        this.particleRenderer.setPhase(
            Object.values(ANIMATION_CONFIG.PHASES).indexOf(newPhase),
            ANIMATION_CONFIG.DURATIONS[newPhase.toUpperCase()]
        );

        // Notify worker about phase change
        this.worker?.postMessage({
            command: 'phaseChange',
            data: {
                oldPhase,
                newPhase,
                timestamp: now
            }
        });

        this.debug.track('Phase Changed', newPhase);
    }

    /**
     * Handle particle selection and mesh creation
     */
    handleParticleSelection(selectedIndices) {
        this.selectedIndices = new Set(selectedIndices);
        this.createSelectedParticleMeshes(selectedIndices);
        this.particleRenderer.updateSelection(this.selectedIndices);
    }

    /**
     * Reset simulation state
     */
    resetSimulation() {
        // Reset timing and state
        this.currentPhase = ANIMATION_CONFIG.PHASES.FLOATING;
        this.phaseStartTime = 0;
        this.blackholeStartTime = 0;
        this.clashStartTime = 0;
        this.lineUpStartTime = 0;
        this.simulationStarted = false;
        this.luckyParticleSelected = false;

        // Clear selections and targets
        this.selectedIndices.clear();
        this.targetPositions.clear();

        // Clean up meshes
        this.cleanupMeshes();

        // Reset visuals
        this.webglManager.setBlackholeVisibility(false);
        this.particleRenderer.resetParticles();

        // Reset worker and buffers
        this.cleanupWorker();

        // Reset shared buffer
        if (this.sharedBuffer) {
            const view = new Float32Array(this.sharedBuffer);
            view.fill(0);
        }

        // Update UI
        this.ui.updateButtonStates(false);
        this.ui.updateProgress(this.currentPhase, 0);

        this.debug.track('Simulation', 'Reset');
    }

    /**
     * Clean up resources
     */
    dispose() {
        this.cleanupWorker();
        this.cleanupMeshes();
        this.selectedIndices.clear();
        this.targetPositions.clear();
        this.sharedBuffer = null;
        this.particlePositions = null;
        this.particleVelocities = null;
        this.debug.track('SimulationController', 'Disposed');
    }

    /**
     * Clean up worker resources
     */
    cleanupWorker() {
        if (this.worker) {
            this.worker.postMessage({ command: 'cleanup' });
            this.worker.terminate();
            this.worker = null;
        }
    }

    /**
     * Clean up mesh resources
     */
    cleanupMeshes() {
        for (const mesh of this.selectedParticleMeshes.values()) {
            this.webglManager.removeMesh(mesh);
            if (mesh.material.map) {
                mesh.material.map.dispose();
            }
            mesh.material.dispose();
            mesh.geometry.dispose();
        }
        this.selectedParticleMeshes.clear();
    }

    /**
     * Check if simulation has started
     */
    isSimulationStarted() {
        return this.simulationStarted;
    }

    /**
     * Check if lucky particle has been selected
     */
    isLuckyParticleSelected() {
        return this.luckyParticleSelected;
    }

    /**
     * Get selected particle meshes
     */
    getSelectedParticleMeshes() {
        return this.selectedParticleMeshes;
    }

    /**
     * Start the lucky draw phase
     */
    startLuckyDraw(targetCount) {
        if (!this.simulationStarted || this.luckyParticleSelected) return;

        this.luckyParticleSelected = true;
        this.selectLuckyParticles(targetCount);
        this.setPhase(ANIMATION_CONFIG.PHASES.SWIRLING);
    }

    /**
     * Select lucky particles randomly
     */
    selectLuckyParticles(count) {
        const particleCount = this.particlePositions.length / 3;
        const indices = new Set();
        
        // Select random unique indices
        while (indices.size < count) {
            indices.add(Math.floor(Math.random() * particleCount));
        }

        this.selectedIndices = indices;
        this.createSelectedParticleMeshes(Array.from(indices));

        // Notify worker about selection
        this.worker.postMessage({
            command: 'updateSelected',
            data: { 
                selected: Array.from(indices),
                params: this.getCurrentPhaseParams()
            }
        });

        this.debug.track('Lucky Draw', `Selected ${count} particles`);
    }

    /**
     * Create meshes for selected particles
     */
    createSelectedParticleMeshes(indices) {
        indices.forEach((index, i) => {
            const position = new THREE.Vector3(
                this.particlePositions[index * 3],
                this.particlePositions[index * 3 + 1],
                this.particlePositions[index * 3 + 2]
            );

            // Create text mesh for the number
            const mesh = this.createNumberMesh(index + 1);
            mesh.position.copy(position);
            
            this.selectedParticleMeshes.set(index, mesh);
            this.webglManager.addMesh(mesh);

            // Store target position for line-up phase
            const targetPos = new THREE.Vector3(
                -1 + (i * 2 / (indices.length - 1)),
                0,
                0
            );
            this.targetPositions.set(index, targetPos);
        });
    }

    /**
     * Create a mesh for displaying a number
     */
    createNumberMesh(number) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 64;
        canvas.height = 64;

        // Draw number with glow effect
        ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(number.toString(), 32, 32);

        // Create texture and mesh
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            blending: THREE.AdditiveBlending
        });

        const mesh = new THREE.Sprite(material);
        mesh.scale.set(0.5, 0.5, 1);

        return mesh;
    }
}
