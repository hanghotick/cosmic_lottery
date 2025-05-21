// WebGLManager.js - Handles WebGL setup, restoration, and context loss.
import { CAMERA_CONFIG, PHYSICS_CONFIG } from './config.js';

/**
 * Manages WebGL context, including setup, context loss, and restoration.
 */
export class WebGLManager {
    constructor(debug, ui) {
        this.debug = debug;
        this.ui = ui;
        
        // THREE.js components
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.cubeWireframe = null;
        
        // Camera controls
        this.cameraRadius = parseInt(ui.elements.zoomSlider.value);
        this.cameraPhi = CAMERA_CONFIG.DEFAULT_PHI;
        this.cameraTheta = CAMERA_CONFIG.DEFAULT_THETA;
        
        // Mouse interaction
        this.isDragging = false;
        this.previousClientX = 0;
        this.previousClientY = 0;

        // State management
        this.savedState = null;
        this.isContextLost = false;

        this.debug.track('WebGL', 'Created');
    }

    /**
     * Initialize Three.js scene and renderer
     */
    init() {
        // Check THREE.js availability
        if (typeof THREE === 'undefined') {
            throw new Error('THREE.js library is not loaded');
        }

        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = null;

        // Camera setup
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.updateCameraPosition();

        // Renderer setup with antialiasing and alpha
        const canvasElement = document.getElementById('particleCanvas');
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            canvas: canvasElement,
            alpha: true 
        });

        // Set initial size
        const initialWidth = Math.min(window.innerWidth * 0.8, 1536);
        const initialHeight = Math.min(window.innerHeight * 0.7, 864);
        canvasElement.style.width = `${initialWidth}px`;
        canvasElement.style.height = `${initialHeight}px`;
        this.renderer.setSize(initialWidth, initialHeight);
        this.renderer.setClearColor(0x000000, 0);

        // Add context loss/restore handlers
        canvasElement.addEventListener('webglcontextlost', this.handleContextLost.bind(this), false);
        canvasElement.addEventListener('webglcontextrestored', this.handleContextRestored.bind(this), false);

        // Add mouse/touch handlers
        this.addEventListeners(canvasElement);

        // Create cube wireframe border
        const geometry = new THREE.BoxGeometry(PHYSICS_CONFIG.BOX_SIZE, PHYSICS_CONFIG.BOX_SIZE, PHYSICS_CONFIG.BOX_SIZE);
        const edges = new THREE.EdgesGeometry(geometry);
        this.cubeWireframe = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x404080 }));
        this.scene.add(this.cubeWireframe);

        this.debug.track('WebGL', 'Initialized');
    }

    /**
     * Update camera position based on spherical coordinates
     */
    updateCameraPosition() {
        if (!this.camera) return;

        this.camera.position.set(
            this.cameraRadius * Math.sin(this.cameraTheta) * Math.sin(this.cameraPhi),
            this.cameraRadius * Math.cos(this.cameraTheta),
            this.cameraRadius * Math.sin(this.cameraTheta) * Math.cos(this.cameraPhi)
        );
        this.camera.lookAt(0, 0, 0);
        this.camera.updateProjectionMatrix();
    }

    /**
     * Handle window resize event
     */
    handleResize() {
        if (!this.camera || !this.renderer) return;

        const width = window.innerWidth;
        const height = window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
    }

    /**
     * Add event listeners for mouse/touch interaction
     */
    addEventListeners(canvasElement) {
        // Mouse events
        canvasElement.addEventListener('mousedown', this.onPointerDown.bind(this), false);
        canvasElement.addEventListener('mousemove', this.onPointerMove.bind(this), false);
        canvasElement.addEventListener('mouseup', this.onPointerUp.bind(this), false);
        canvasElement.addEventListener('mouseleave', this.onPointerUp.bind(this), false);

        // Touch events
        canvasElement.addEventListener('touchstart', this.onPointerDown.bind(this), { passive: false });
        canvasElement.addEventListener('touchmove', this.onPointerMove.bind(this), { passive: false });
        canvasElement.addEventListener('touchend', this.onPointerUp.bind(this), false);
        canvasElement.addEventListener('touchcancel', this.onPointerUp.bind(this), false);

        // Zoom
        canvasElement.addEventListener('wheel', this.onMouseWheel.bind(this), { passive: false });

        // Window resize
        window.addEventListener('resize', this.handleResize.bind(this), false);
    }

    /**
     * Handle pointer (mouse/touch) down event
     */
    onPointerDown(event) {
        this.isDragging = true;
        if (event.touches) {
            this.previousClientX = event.touches[0].clientX;
            this.previousClientY = event.touches[0].clientY;
        } else {
            this.previousClientX = event.clientX;
            this.previousClientY = event.clientY;
        }
        event.preventDefault();
    }

    /**
     * Handle pointer (mouse/touch) move event
     */
    onPointerMove(event) {
        if (!this.isDragging) return;

        let currentClientX, currentClientY;
        if (event.touches) {
            currentClientX = event.touches[0].clientX;
            currentClientY = event.touches[0].clientY;
        } else {
            currentClientX = event.clientX;
            currentClientY = event.clientY;
        }

        const deltaX = currentClientX - this.previousClientX;
        const deltaY = currentClientY - this.previousClientY;

        this.cameraPhi -= deltaX * 0.005;
        this.cameraTheta = Math.max(
            0.01,
            Math.min(Math.PI - 0.01, this.cameraTheta - deltaY * 0.005)
        );

        this.updateCameraPosition();

        this.previousClientX = currentClientX;
        this.previousClientY = currentClientY;
        event.preventDefault();
    }

    /**
     * Handle pointer (mouse/touch) up event
     */
    onPointerUp() {
        this.isDragging = false;
    }

    /**
     * Handle mouse wheel zoom event
     */
    onMouseWheel(event) {
        event.preventDefault();

        const zoomSensitivity = CAMERA_CONFIG.ZOOM_SENSITIVITY;
        this.cameraRadius += event.deltaY * zoomSensitivity;
        this.cameraRadius = Math.max(
            CAMERA_CONFIG.MIN_Z,
            Math.min(CAMERA_CONFIG.MAX_Z, this.cameraRadius)
        );

        this.updateCameraPosition();
    }

    /**
     * Handle WebGL context loss
     */
    handleContextLost(event) {
        event.preventDefault();
        this.isContextLost = true;
        this.debug.track('WebGL', 'Context lost');

        // Save current state
        this.savedState = {
            cameraPosition: this.camera?.position.clone(),
            cameraRotation: this.camera?.rotation.clone(),
            cameraRadius: this.cameraRadius,
            cameraPhi: this.cameraPhi,
            cameraTheta: this.cameraTheta
        };

        // Notify UI
        this.ui.showError('Graphics context lost. Please wait...');
    }

    /**
     * Handle WebGL context restoration
     */
    async handleContextRestored() {
        this.debug.track('WebGL', 'Context restored');
        try {
            await this.init();
            
            // Restore saved state if available
            if (this.savedState) {
                Object.assign(this, this.savedState);
                this.updateCameraPosition();
                this.savedState = null;
            }

            this.isContextLost = false;
            this.ui.showMessage('Graphics restored successfully.');
        } catch (error) {
            this.debug.track('WebGL Error', error.message);
            this.ui.showError('Failed to restore graphics context.');
            throw error;
        }
    }

    /**
     * Clean up WebGL resources
     */
    dispose() {
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer.forceContextLoss();
            this.renderer = null;
        }

        if (this.cubeWireframe) {
            this.scene.remove(this.cubeWireframe);
            this.cubeWireframe.geometry.dispose();
            this.cubeWireframe.material.dispose();
            this.cubeWireframe = null;
        }

        if (this.scene) {
            this.scene.clear();
            this.scene = null;
        }

        this.camera = null;
        this.debug.track('WebGL', 'Disposed');

        // Remove window resize listener
        window.removeEventListener('resize', this.handleResize);
    }

    /**
     * Get renderer context status
     */
    isContextActive() {
        return this.renderer && !this.isContextLost;
    }

    /**
     * Render a frame
     */
    render() {
        if (this.isContextActive()) {
            this.renderer.render(this.scene, this.camera);
        }
    }
}
