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
    }    /**
     * Update particle visuals with new positions
     */
    updateParticleVisuals() {
        if (!this.particleRenderer) return;

        // Batch updates for better performance
        const updates = {
            positions: this.particlePositions,
            time: performance.now() * 0.001,
            selection: this.selectedIndices.size > 0 ? this.selectedIndices : null
        };

        // Update particle renderer state
        this.particleRenderer.updatePositions(updates.positions);
        this.particleRenderer.updateTime(updates.time);
        
        if (updates.selection) {
            this.particleRenderer.updateSelection(updates.selection);
        }

        // Update selected particle meshes efficiently
        if (this.selectedIndices.size > 0) {
            this.updateSelectedMeshes();
        }
    }

    /**
     * Update selected particle meshes efficiently
     */
    updateSelectedMeshes() {
        const now = performance.now();
        const phase = this.currentPhase;
        
        for (const [index, mesh] of this.selectedParticleMeshes) {
            const idx = index * 3;
            const position = new THREE.Vector3(
                this.particlePositions[idx],
                this.particlePositions[idx + 1],
                this.particlePositions[idx + 2]
            );

            // Apply phase-specific visual effects
            switch (phase) {
                case ANIMATION_CONFIG.PHASES.SWIRLING:
                    this.applySwirlingEffect(mesh, position, now);
                    break;

                case ANIMATION_CONFIG.PHASES.BLACKHOLE:
                    this.applyBlackholeEffect(mesh, position, now);
                    break;

                case ANIMATION_CONFIG.PHASES.SELECTION:
                    this.applySelectionEffect(mesh, position, now);
                    break;

                default:
                    mesh.position.copy(position);
            }

            // Update mesh visibility based on phase
            mesh.visible = this.shouldShowMeshInPhase(phase);
        }
    }    /**
     * Apply swirling effect to selected particle mesh
     */
    applySwirlingEffect(mesh, position, timestamp) {
        // Calculate orbital movement
        const orbitalSpeed = 0.001;
        const orbitalRadius = 0.1;
        const orbitalOffset = new THREE.Vector3(
            Math.cos(timestamp * orbitalSpeed) * orbitalRadius,
            Math.sin(timestamp * orbitalSpeed) * orbitalRadius,
            0
        );
        
        // Apply smooth swirling motion
        const swirlingFactor = Math.sin(timestamp * 0.001) * 0.2;
        const rotationSpeed = timestamp * 0.002;
        
        mesh.position.copy(position).add(orbitalOffset);
        mesh.rotation.z = rotationSpeed;
        mesh.scale.setScalar(mesh.userData.initialScale.x * (1 + swirlingFactor));
        
        if (mesh.material) {
            // Pulse opacity with swirl
            const opacityBase = 0.7;
            const opacityPulse = Math.sin(timestamp * 0.003) * 0.3;
            mesh.material.opacity = Math.max(0.3, opacityBase + opacityPulse + swirlingFactor);
            
            // Add color shift effect
            const hue = (timestamp * 0.0001) % 1;
            this.applyColorShift(mesh.material, hue);
        }
    }

    /**
     * Apply blackhole effect to selected particle mesh
     */
    applyBlackholeEffect(mesh, position, timestamp) {
        // Calculate distance-based effects
        const center = new THREE.Vector3(0, 0, 0);
        const distanceFromCenter = position.distanceTo(center);
        const maxDistance = 5; // Adjust based on your scene scale
        
        // Calculate gravitational distortion
        const distortionFactor = Math.max(0.2, 1 - (distanceFromCenter / maxDistance));
        const spiralFactor = (timestamp * 0.001) + (distanceFromCenter * 0.5);
        
        // Apply spiral motion towards center
        const spiralPosition = new THREE.Vector3(
            position.x * Math.cos(spiralFactor) - position.y * Math.sin(spiralFactor),
            position.x * Math.sin(spiralFactor) + position.y * Math.cos(spiralFactor),
            position.z
        ).multiplyScalar(distortionFactor);
        
        mesh.position.copy(spiralPosition);
        mesh.rotation.z = spiralFactor * 2;
        mesh.scale.setScalar(mesh.userData.initialScale.x * distortionFactor);
        
        if (mesh.material) {
            // Apply distance-based opacity
            mesh.material.opacity = Math.max(0.1, distortionFactor);
            
            // Add gravitational color shift
            const blueShift = Math.max(0, 1 - distortionFactor);
            this.applyColorShift(mesh.material, 0.6 + (blueShift * 0.1));
        }
    }

    /**
     * Apply selection effect to selected particle mesh
     */
    applySelectionEffect(mesh, position, timestamp) {
        // Calculate pulsing effect
        const pulseFreq = 0.003;
        const pulseAmp = 0.2;
        const pulseEffect = pulseAmp * Math.sin(timestamp * pulseFreq) + 1;
        
        // Calculate hovering motion
        const hoverHeight = Math.sin(timestamp * 0.002) * 0.1;
        const hoverPosition = position.clone().add(new THREE.Vector3(0, 0, hoverHeight));
        
        // Apply combined effects
        mesh.position.copy(hoverPosition);
        mesh.rotation.z = Math.sin(timestamp * 0.001) * 0.1;
        mesh.scale.setScalar(mesh.userData.initialScale.x * pulseEffect);
        
        if (mesh.material) {
            // Apply glowing effect
            const glowIntensity = 0.8 + (pulseEffect - 1) * 2;
            mesh.material.opacity = Math.min(1, glowIntensity);
            
            // Add subtle color cycling
            const hue = (timestamp * 0.0001 + mesh.userData.number * 0.1) % 1;
            this.applyColorShift(mesh.material, hue);
        }
    }

    /**
     * Apply color shift effect to material
     */
    applyColorShift(material, hue) {
        if (!material.userData.originalColor) {
            material.userData.originalColor = material.color.clone();
        }

        // Convert HSL to RGB
        const rgb = this.hslToRgb(hue, 0.3, 0.8);
        material.color.setRGB(rgb.r, rgb.g, rgb.b);
    }

    /**
     * Convert HSL color to RGB
     */
    hslToRgb(h, s, l) {
        let r, g, b;

        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;

            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }

        return { r, g, b };
    }

    /**
     * Determine if mesh should be visible in current phase
     */
    shouldShowMeshInPhase(phase) {
        switch (phase) {
            case ANIMATION_CONFIG.PHASES.FLOATING:
            case ANIMATION_CONFIG.PHASES.LINING_UP:
                return true;
            case ANIMATION_CONFIG.PHASES.BLACKHOLE:
                return false;
            default:
                return true;
        }
    }    /**
     * Handle phase change with transition management
     */
    handlePhaseChange(newPhase) {
        // Track current transition state
        const transitionState = {
            fromPhase: this.currentPhase,
            toPhase: newPhase,
            startTime: performance.now(),
            inProgress: true
        };

        // Validate and prepare for phase change
        if (!this.preparePhaseTransition(transitionState)) {
            return;
        }

        try {
            // Apply the phase change
            this.setPhase(newPhase);

            // Handle special phase requirements
            if (newPhase === ANIMATION_CONFIG.PHASES.SELECTION && !this.luckyParticleSelected) {
                this.startLuckyDraw(this.luckyParticleCount);
            }

            // Track successful transition
            this.debug.track('Phase Transition', {
                from: transitionState.fromPhase,
                to: newPhase,
                duration: performance.now() - transitionState.startTime
            });

        } catch (error) {
            // Handle transition failure
            this.handleTransitionError(transitionState, error);
        }
    }

    /**
     * Prepare for phase transition
     */
    preparePhaseTransition(transitionState) {
        // Check if we're already transitioning
        if (this.isTransitioning) {
            this.debug.track('Transition Blocked', 'Already in transition');
            return false;
        }

        // Validate the transition
        if (!this.isValidPhaseTransition(transitionState.fromPhase, transitionState.toPhase)) {
            this.debug.track('Invalid Transition', {
                from: transitionState.fromPhase,
                to: transitionState.toPhase
            });
            return false;
        }

        this.isTransitioning = true;
        return true;
    }

    /**
     * Handle transition errors
     */
    handleTransitionError(transitionState, error) {
        this.debug.track('Transition Error', {
            from: transitionState.fromPhase,
            to: transitionState.toPhase,
            error: error.message
        });

        // Attempt to restore previous state
        try {
            this.setPhase(transitionState.fromPhase);
            this.debug.track('State Restored', `Reverted to ${transitionState.fromPhase}`);
        } catch (restoreError) {
            // If restore fails, try to reset to a safe state
            this.debug.track('Restore Failed', restoreError.message);
            this.resetToSafeState();
        }
    }

    /**
     * Reset to a safe state after error
     */
    resetToSafeState() {
        // Attempt to reset to FLOATING phase
        this.currentPhase = ANIMATION_CONFIG.PHASES.FLOATING;
        this.phaseStartTime = performance.now();
        this.cleanupTransitionState();
        
        // Reset any active effects
        this.webglManager.setBlackholeVisibility(false);
        this.particleRenderer.resetParticles();
        
        this.debug.track('Safe State', 'Reset to FLOATING phase');
    }

    /**
     * Clean up after transition
     */
    cleanupTransitionState() {
        this.isTransitioning = false;
    }

    /**
     * Update simulation state
     */
    async update(timestamp) {
        if (!this.worker || this.isProcessing || 
            timestamp - this.lastUpdateTime < this.UPDATE_INTERVAL || 
            !this.simulationStarted) {
            return;
        }

        this.lastUpdateTime = timestamp;
        this.isProcessing = true;

        try {
            // Update phase transitions before sending data to worker
            const previousPhase = this.currentPhase;
            this.updatePhase(timestamp);
            
            // Get current phase parameters
            const phaseParams = this.getCurrentPhaseParams();
            
            // Calculate phase-specific timing parameters
            const timingParams = {
                blackholeStartTime: this.blackholeStartTime,
                blackholeDuration: ANIMATION_CONFIG.DURATIONS.BLACKHOLE,
                clashStartTime: this.clashStartTime,
                lineUpStartTime: this.lineUpStartTime,
                lineUpDuration: this.lineUpDuration,
                phaseStartTime: this.phaseStartTime,
                phaseDuration: ANIMATION_CONFIG.DURATIONS[this.currentPhase.toUpperCase()],
                currentTime: timestamp
            };

            // Prepare update data with minimal object spread
            const updateParams = Object.assign(
                {},
                PHYSICS_CONFIG,
                phaseParams,
                timingParams,
                {
                    selectedIndices: Array.from(this.selectedIndices),
                    targetPositions: Array.from(this.targetPositions.entries())
                }
            );

            // Send update to worker with optimized message
            this.worker.postMessage({
                command: 'update',
                data: {
                    params: updateParams,
                    phase: this.currentPhase,
                    time: timestamp,
                    phaseChanged: previousPhase !== this.currentPhase
                }
            });
            
            // Update UI progress and debug info
            const phaseProgress = this.calculatePhaseProgress(timestamp);
            this.ui.updateProgress(this.currentPhase, phaseProgress);
            this.debug.track('Phase Progress', `${Math.round(phaseProgress * 100)}%`);
            
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
    }    /**
     * Set current phase and handle transitions
     */
    setPhase(newPhase) {
        const now = performance.now();
        const oldPhase = this.currentPhase;
        
        // Validate phase transition
        if (!this.isValidPhaseTransition(oldPhase, newPhase)) {
            this.debug.track('Invalid Phase Transition', `${oldPhase} -> ${newPhase}`);
            return;
        }

        // Update phase state
        this.currentPhase = newPhase;
        this.phaseStartTime = now;
        
        // Handle phase-specific initialization
        this.handlePhaseInitialization(newPhase, now);
        
        // Update visuals
        this.updateVisualsForPhase(newPhase);
        
        // Notify particle renderer of phase change with duration
        const phaseDuration = ANIMATION_CONFIG.DURATIONS[newPhase.toUpperCase()];
        this.particleRenderer.setPhase(
            Object.values(ANIMATION_CONFIG.PHASES).indexOf(newPhase),
            phaseDuration
        );

        // Send comprehensive phase change notification to worker
        if (this.worker) {
            this.worker.postMessage({
                command: 'phaseChange',
                data: {
                    oldPhase,
                    newPhase,
                    timestamp: now,
                    duration: phaseDuration,
                    params: this.getCurrentPhaseParams(),
                    selectedIndices: Array.from(this.selectedIndices),
                    targetPositions: Array.from(this.targetPositions.entries())
                }
            });
        }

        this.debug.track('Phase Changed', {
            from: oldPhase,
            to: newPhase,
            duration: phaseDuration,
            selectedCount: this.selectedIndices.size
        });
    }

    /**
     * Validate phase transition
     */
    isValidPhaseTransition(oldPhase, newPhase) {
        const validTransitions = {
            [ANIMATION_CONFIG.PHASES.FLOATING]: [ANIMATION_CONFIG.PHASES.SWIRLING],
            [ANIMATION_CONFIG.PHASES.SWIRLING]: [ANIMATION_CONFIG.PHASES.BLACKHOLE],
            [ANIMATION_CONFIG.PHASES.BLACKHOLE]: [ANIMATION_CONFIG.PHASES.CLASHING],
            [ANIMATION_CONFIG.PHASES.CLASHING]: [ANIMATION_CONFIG.PHASES.SELECTION],
            [ANIMATION_CONFIG.PHASES.SELECTION]: [ANIMATION_CONFIG.PHASES.LINING_UP],
            [ANIMATION_CONFIG.PHASES.LINING_UP]: []
        };

        return validTransitions[oldPhase]?.includes(newPhase) || oldPhase === newPhase;
    }

    /**
     * Initialize phase-specific state
     */
    handlePhaseInitialization(phase, timestamp) {
        switch (phase) {
            case ANIMATION_CONFIG.PHASES.SWIRLING:
                this.blackholeStartTime = timestamp + ANIMATION_CONFIG.DURATIONS.SWIRL;
                // Reset any residual forces
                if (this.worker) {
                    this.worker.postMessage({
                        command: 'resetForces',
                        data: { timestamp }
                    });
                }
                break;

            case ANIMATION_CONFIG.PHASES.BLACKHOLE:
                this.webglManager.setBlackholeVisibility(true);
                // Initialize blackhole effect
                this.webglManager.createBlackholeEffect();
                break;

            case ANIMATION_CONFIG.PHASES.CLASHING:
                this.clashStartTime = timestamp;
                this.webglManager.setBlackholeVisibility(false);
                // Clean up blackhole effect
                this.webglManager.removeBlackholeEffect();
                break;

            case ANIMATION_CONFIG.PHASES.SELECTION:
                // Prepare for selection if not already done
                if (!this.luckyParticleSelected && this.luckyParticleCount) {
                    this.startLuckyDraw(this.luckyParticleCount);
                }
                break;

            case ANIMATION_CONFIG.PHASES.LINING_UP:
                this.lineUpStartTime = timestamp;
                // Update target positions for selected particles
                this.updateSelectedParticleTargets();
                break;
        }
    }

    /**
     * Update visuals for the current phase
     */
    updateVisualsForPhase(phase) {
        switch (phase) {
            case ANIMATION_CONFIG.PHASES.SWIRLING:
                // Update particle colors for swirling effect
                this.particleRenderer.setParticleColors(
                    ANIMATION_CONFIG.COLORS.SWIRL_START,
                    ANIMATION_CONFIG.COLORS.SWIRL_END
                );
                break;

            case ANIMATION_CONFIG.PHASES.BLACKHOLE:
                // Apply blackhole visual effects
                this.particleRenderer.setParticleColors(
                    ANIMATION_CONFIG.COLORS.BLACKHOLE_START,
                    ANIMATION_CONFIG.COLORS.BLACKHOLE_END
                );
                break;

            case ANIMATION_CONFIG.PHASES.SELECTION:
                // Highlight selected particles
                this.particleRenderer.setParticleColors(
                    ANIMATION_CONFIG.COLORS.SELECTED,
                    ANIMATION_CONFIG.COLORS.UNSELECTED
                );
                break;
        }
    }

    /**
     * Update target positions for selected particles
     */
    updateSelectedParticleTargets() {
        const selectedArray = Array.from(this.selectedIndices);
        selectedArray.forEach((index, i) => {
            const targetPos = new THREE.Vector3(
                -1 + (i * 2 / (selectedArray.length - 1)),
                0,
                0
            );
            this.targetPositions.set(index, targetPos);
        });

        // Update worker with new target positions
        if (this.worker) {
            this.worker.postMessage({
                command: 'updateTargets',
                data: {
                    targetPositions: Array.from(this.targetPositions.entries())
                }
            });
        }
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
    }    /**
     * Create a mesh for displaying a number
     */
    createNumberMesh(number) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Increase canvas size for better quality
        canvas.width = 128;
        canvas.height = 128;
        
        // Create background glow
        const gradient = ctx.createRadialGradient(64, 64, 10, 64, 64, 40);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 128, 128);

        // Draw number with enhanced visual effects
        ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = 16;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 72px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Draw outer glow
        ctx.globalAlpha = 0.4;
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const xOffset = Math.cos(angle) * 2;
            const yOffset = Math.sin(angle) * 2;
            ctx.shadowOffsetX = xOffset;
            ctx.shadowOffsetY = yOffset;
            ctx.fillText(number.toString(), 64 + xOffset, 64 + yOffset);
        }
        
        // Draw main number
        ctx.globalAlpha = 1.0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillText(number.toString(), 64, 64);

        // Create texture with proper settings
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipMapLinearFilter;
        texture.magFilter = THREE.LinearFilter;

        // Create material with enhanced settings
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthTest: true,
            depthWrite: false,
            opacity: 1.0
        });

        // Create sprite with proper rendering settings
        const mesh = new THREE.Sprite(material);
        mesh.scale.set(0.5, 0.5, 1);
        mesh.renderOrder = 1;        
        
        // Store initial properties for animations
        mesh.userData.initialScale = new THREE.Vector3(0.5, 0.5, 1);
        mesh.userData.initialOpacity = 1.0;
        mesh.userData.number = number;

        return mesh;
    }

    /**
     * Apply transition effects between phases
     */
    applyTransitionEffects(fromPhase, toPhase, progress) {
        // Apply phase-specific transition effects to selected particles
        for (const [index, mesh] of this.selectedParticleMeshes) {
            const position = new THREE.Vector3(
                this.particlePositions[index * 3],
                this.particlePositions[index * 3 + 1],
                this.particlePositions[index * 3 + 2]
            );

            switch(toPhase) {
                case ANIMATION_CONFIG.PHASES.SWIRLING:
                    this.applySwirlingTransition(mesh, position, progress);
                    break;

                case ANIMATION_CONFIG.PHASES.BLACKHOLE:
                    this.applyBlackholeTransition(mesh, position, progress);
                    break;

                case ANIMATION_CONFIG.PHASES.SELECTION:
                    this.applySelectionTransition(mesh, position, progress);
                    break;

                case ANIMATION_CONFIG.PHASES.LINING_UP:
                    this.applyLineUpTransition(mesh, position, progress);
                    break;
            }
        }
    }

    /**
     * Apply swirling transition effect
     */
    applySwirlingTransition(mesh, position, progress) {
        // Gradually increase swirl intensity
        const swirlingIntensity = progress * 0.2;
        const timestamp = performance.now();
        
        // Calculate orbital movement with increasing radius
        const orbitalRadius = progress * 0.15;
        const orbitalSpeed = 0.001 * (1 + progress);
        const orbitalOffset = new THREE.Vector3(
            Math.cos(timestamp * orbitalSpeed) * orbitalRadius,
            Math.sin(timestamp * orbitalSpeed) * orbitalRadius,
            0
        );

        // Apply position and rotation
        mesh.position.copy(position).add(orbitalOffset);
        mesh.rotation.z = timestamp * 0.002 * progress;
        mesh.scale.setScalar(mesh.userData.initialScale.x * (1 + swirlingIntensity));

        if (mesh.material) {
            // Gradually increase glow effect
            const opacity = 0.7 + (progress * 0.3);
            mesh.material.opacity = opacity;

            // Transition color
            const hue = (timestamp * 0.0001 * progress) % 1;
            this.applyColorShift(mesh.material, hue);
        }
    }

    /**
     * Apply blackhole transition effect
     */
    applyBlackholeTransition(mesh, position, progress) {
        const center = new THREE.Vector3(0, 0, 0);
        const distanceFromCenter = position.distanceTo(center);
        
        // Increase gravitational pull over time
        const distortionFactor = Math.max(0.2, 1 - (distanceFromCenter / 5) * (1 - progress));
        const spiralFactor = progress * Math.PI * 2;

        // Calculate spiral motion
        const angle = spiralFactor + (distanceFromCenter * 0.5);
        const spiralPosition = new THREE.Vector3(
            position.x * Math.cos(angle) - position.y * Math.sin(angle),
            position.x * Math.sin(angle) + position.y * Math.cos(angle),
            position.z
        ).multiplyScalar(1 - (progress * 0.5));

        // Apply transformations
        mesh.position.copy(spiralPosition);
        mesh.rotation.z = angle;
        mesh.scale.setScalar(mesh.userData.initialScale.x * (1 - progress * 0.5));

        if (mesh.material) {
            // Fade out as particles approach the blackhole
            mesh.material.opacity = Math.max(0.1, 1 - progress);
            
            // Shift color towards blue/purple
            const blueShift = 0.6 + (progress * 0.1);
            this.applyColorShift(mesh.material, blueShift);
        }
    }

    /**
     * Apply selection transition effect
     */
    applySelectionTransition(mesh, position, progress) {
        // Calculate smooth hover effect
        const hoverHeight = Math.sin(progress * Math.PI) * 0.1;
        const targetPosition = position.clone().add(new THREE.Vector3(0, 0, hoverHeight));
        
        // Apply pulsing scale effect
        const pulseScale = 1 + Math.sin(progress * Math.PI * 4) * 0.2;
        
        // Update mesh properties
        mesh.position.copy(targetPosition);
        mesh.rotation.z = progress * Math.PI * 2;
        mesh.scale.setScalar(mesh.userData.initialScale.x * pulseScale);

        if (mesh.material) {
            // Increase glow intensity
            const glowIntensity = 0.7 + (progress * 0.3);
            mesh.material.opacity = glowIntensity;

            // Transition to victory colors
            const hue = 0.15 + (progress * 0.1); // Golden hue
            this.applyColorShift(mesh.material, hue);
        }
    }

    /**
     * Apply line-up transition effect
     */
    applyLineUpTransition(mesh, position, progress) {
        const index = mesh.userData.number - 1;
        const targetPosition = this.targetPositions.get(index);
        
        if (!targetPosition) return;

        // Smoothly interpolate to target position
        const interpolatedPosition = position.clone().lerp(targetPosition, progress);
        
        // Add subtle floating motion
        const floatOffset = Math.sin(performance.now() * 0.002 + index) * 0.05 * (1 - progress);
        interpolatedPosition.y += floatOffset;

        // Apply transformations
        mesh.position.copy(interpolatedPosition);
        mesh.rotation.z = Math.PI * 2 * progress;
        mesh.scale.setScalar(mesh.userData.initialScale.x * (1 + Math.sin(progress * Math.PI) * 0.2));

        if (mesh.material) {
            // Maintain full visibility
            mesh.material.opacity = 1.0;
            
            // Subtle color pulsing
            const hue = 0.15 + Math.sin(performance.now() * 0.001 + index * 0.1) * 0.05;
            this.applyColorShift(mesh.material, hue);
        }
    }
}
