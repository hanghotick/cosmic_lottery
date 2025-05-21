// SimulationController.js - Handles simulation state and physics updates
import { ANIMATION_CONFIG, PHYSICS_CONFIG } from './config.js';

/**
 * Controls the simulation state and physics updates
 */
export class SimulationController {
    constructor(debug, particleRenderer) {
        this.debug = debug;
        this.particleRenderer = particleRenderer;
        
        // Worker and update handling
        this.worker = null;
        this.isProcessing = false;
        this.lastUpdateTime = 0;
        this.UPDATE_INTERVAL = 16; // ~60fps

        // Simulation state
        this.currentPhase = ANIMATION_CONFIG.PHASES.FLOATING;
        this.selectedIndices = new Set();
        this.isFloating = true;
        this.isSwirling = false;
        this.isClashing = false;
        this.isLiningUp = false;

        // Timing
        this.clashStartTime = 0;
        this.lineUpStartTime = 0;

        this.debug.track('SimulationController', 'Created');
    }

    /**
     * Initialize the worker
     */
    initializeWorker() {
        // Clean up existing worker if any
        if (this.worker) {
            this.worker.terminate();
        }

        this.worker = new Worker('worker.js');
        this.worker.onmessage = this.handleWorkerMessage.bind(this);

        // Set initial worker state
        this.worker.postMessage({
            command: 'init',
            data: { particleCount: this.particleRenderer.getParticleCount() }
        });

        this.debug.track('Worker', 'Initialized');
    }

    /**
     * Handle worker messages
     */
    handleWorkerMessage(e) {
        const { command, positions, velocities, error } = e.data;

        if (error) {
            if (command === 'validation_error') {
                this.debug.track('Worker Error', error);
                return;
            }
            this.handleWorkerError(error);
            return;
        }

        if (command === 'updated') {
            this.updateParticleVisuals(positions, velocities);
        }
    }

    /**
     * Handle worker errors
     */
    handleWorkerError(error) {
        this.debug.track('Worker Error', error);
        
        try {
            this.initializeWorker();
        } catch (err) {
            this.debug.track('Worker Restart Failed', err.message);
            throw new Error('Failed to restart worker: ' + err.message);
        }
    }

    /**
     * Update particle visuals with new positions
     */
    updateParticleVisuals(positions, velocities) {
        if (!this.particleRenderer) return;

        // Update particle positions in the shader
        this.particleRenderer.updatePositions(positions);
        
        // Update selected particles
        if (this.selectedIndices.size > 0) {
            this.particleRenderer.updateSelection(this.selectedIndices);
        }

        // Update time uniform for animations
        this.particleRenderer.updateTime(performance.now() * 0.001);
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
            const updateParams = {
                ...PHYSICS_CONFIG,
                ...this.getCurrentPhaseParams()
            };

            this.worker.postMessage({
                command: 'update',
                data: {
                    params: updateParams,
                    phase: this.currentPhase,
                    time: timestamp,
                    ...this.getAnimationParams()
                }
            });
            
        } catch (error) {
            this.debug.track('Update Error', error.message);
            this.handleWorkerError(error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Get current animation parameters
     */
    getAnimationParams() {
        return {
            isFloating: this.isFloating,
            isSwirling: this.isSwirling,
            isClashing: this.isClashing,
            isLiningUp: this.isLiningUp,
            clashStartTime: this.clashStartTime,
            lineUpStartTime: this.lineUpStartTime
        };
    }

    /**
     * Get parameters for current simulation phase
     */
    getCurrentPhaseParams() {
        switch (this.currentPhase) {
            case ANIMATION_CONFIG.PHASES.FLOATING:
                return {
                    gravitationalPull: PHYSICS_CONFIG.GRAVITY_BASE,
                    orbitalVelocityFactor: PHYSICS_CONFIG.ORBITAL_BASE
                };
            case ANIMATION_CONFIG.PHASES.SWIRLING:
                return {
                    gravitationalPull: PHYSICS_CONFIG.GRAVITY_MAX,
                    orbitalVelocityFactor: PHYSICS_CONFIG.ORBITAL_MAX
                };
            default:
                return {};
        }
    }

    /**
     * Clean up resources
     */
    dispose() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        
        this.selectedIndices.clear();
        this.debug.track('SimulationController', 'Disposed');
    }
}
