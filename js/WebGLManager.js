// WebGLManager.js - Handles WebGL setup, restoration, and context loss.
import { CAMERA_CONFIG, PHYSICS_CONFIG } from './config.js';

/**
 * Manages WebGL context, including setup, context loss, and restoration
 */
export class WebGLManager {
    constructor(debug, ui = null, i18n = null) {
        this.debug = debug;
        this.ui = ui;
        this.i18n = i18n;
        
        // Three.js core components
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        
        // Scene objects
        this.cubeWireframe = null;
        this.blackholeMesh = null;
        this.blackholeUniforms = null;
        
        // Camera controls state
        this.isDragging = false;
        this.previousMousePosition = { x: 0, y: 0 };
        this.currentRotation = { x: 0, y: 0 };
        this.targetRotation = { x: 0, y: 0 };
        this.cameraDistance = CAMERA_CONFIG.INITIAL_DISTANCE;
        
        // Scene state
        this.isActive = false;
        this.canvasElement = null;
        this.resizeObserver = null;
        
        // Performance monitoring
        this.lastFrameTime = 0;
        this.frameCount = 0;
        this.frameTimes = new Array(60).fill(0);
        this.frameTimeIndex = 0;
        this.targetFrameRate = 60;
        this.frameInterval = 1000 / this.targetFrameRate;
        
        // Bind methods
        this.handleResize = this.handleResize.bind(this);
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.onMouseWheel = this.onMouseWheel.bind(this);
    }

    /**
     * Initialize Three.js scene and renderer
     */
    async init() {
        try {
            // Check THREE.js availability
            if (typeof THREE === 'undefined') {
                throw new Error('THREE.js library is not loaded');
            }

            // Clean up existing resources
            this.dispose();

            // Get and validate canvas element
            this.canvasElement = document.getElementById('particleCanvas');
            if (!this.canvasElement) {
                throw new Error('Canvas element not found');
            }

            // Check WebGL support with detailed diagnostics
            if (!this.isWebGLAvailable()) {
                const diagnostics = this.getWebGLDiagnostics();
                throw new Error(`WebGL not supported: ${diagnostics}`);
            }

            // Scene setup with error boundaries
            try {
                this.scene = new THREE.Scene();
                this.scene.background = null;
                const aspect = this.canvasElement.clientWidth / this.canvasElement.clientHeight;
                this.camera = new THREE.PerspectiveCamera(
                    CAMERA_CONFIG.FOV,
                    aspect,
                    CAMERA_CONFIG.NEAR,
                    CAMERA_CONFIG.FAR
                );
                this.renderer = new THREE.WebGLRenderer({
                    canvas: this.canvasElement,
                    antialias: true,
                    alpha: true,
                    powerPreference: "high-performance",
                    failIfMajorPerformanceCaveat: true
                });
                // Optimize renderer settings
                this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                this.renderer.setSize(this.canvasElement.clientWidth, this.canvasElement.clientHeight, false);
                this.renderer.capabilities.getMaxAnisotropy();
                // Robust dev check
                let isDev = false;
                try {
                    isDev = (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') ||
                        (typeof window !== 'undefined' && window.location && window.location.hostname === 'localhost');
                } catch (e) {
                    isDev = false;
                }
                // Only enable shader error checking if available
                if (isDev && this.renderer.debug && typeof this.renderer.debug.checkShaderErrors !== 'undefined') {
                    this.renderer.debug.checkShaderErrors = true;
                }
            } catch (error) {
                throw new Error(`Failed to initialize THREE.js core: ${error.message}`);
            }

            // Set up scene objects with independent error handling
            try {
                await this.createSceneObjects();
            } catch (error) {
                if (this.debug && typeof this.debug.track === 'function') {
                    this.debug.track('Scene Error', `Failed to create scene objects: ${error.message}`);
                }
            }

            // Set up event listeners
            this.setupEventListeners();
            
            this.isActive = true;
            if (this.debug && typeof this.debug.track === 'function') {
                this.debug.track('WebGL', 'Initialization complete');
            }
            
            // Perform initial render
            this.updateCameraPosition();
            this.renderer.render(this.scene, this.camera);
            
            return true;
        } catch (error) {
            if (this.debug && typeof this.debug.track === 'function') {
                this.debug.track('WebGL Error', error.message);
            }
            this.isActive = false;
            throw error;
        }
    }

    getWebGLDiagnostics() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            
            if (!gl) return 'WebGL context creation failed';
            
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'Unknown';
            const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Unknown';
            
            return `Vendor: ${vendor}, Renderer: ${renderer}`;
        } catch (e) {
            return 'Failed to get WebGL diagnostics';
        }
    }

    /**
     * Check if WebGL is available
     */
    isWebGLAvailable() {
        try {
            const canvas = document.createElement('canvas');
            // Fix typo: 'experimental-web-gl' -> 'experimental-webgl'
            const gl = canvas.getContext('webgl2') || 
                      canvas.getContext('webgl') || 
                      canvas.getContext('experimental-webgl');
            const hasWebGL = !!gl;
            if (hasWebGL) {
                gl.getExtension('WEBGL_lose_context')?.loseContext();
            }
            return hasWebGL;
        } catch (e) {
            return false;
        }
    }

    /**
     * Create initial scene objects
     */
    async createSceneObjects() {
        // Create wireframe cube
        this.createWireframeCube();
        
        // Create blackhole effect
        await this.createBlackholeMesh();
        this.setBlackholeVisibility(false);
    }

    /**
     * Create wireframe cube boundary
     */
    createWireframeCube() {
        if (this.cubeWireframe) {
            this.scene.remove(this.cubeWireframe);
            this.cubeWireframe.geometry.dispose();
            this.cubeWireframe.material.dispose();
        }

        const boxSize = PHYSICS_CONFIG.BOX_SIZE;
        const geometry = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
        const material = new THREE.LineBasicMaterial({
            color: 0x808080,
            transparent: true,
            opacity: 0.2
        });

        this.cubeWireframe = new THREE.LineSegments(
            new THREE.WireframeGeometry(geometry),
            material
        );
        this.scene.add(this.cubeWireframe);
    }

    /**
     * Create blackhole effect mesh
     */
    async createBlackholeMesh() {
        // Create uniforms for blackhole shader
        this.blackholeUniforms = {
            time: { value: 0 },
            resolution: { value: new THREE.Vector2() },
            radius: { value: 1.0 },
            distortionStrength: { value: 2.0 }
        };

        // Create blackhole mesh
        const geometry = new THREE.PlaneGeometry(2, 2);
        const material = new THREE.ShaderMaterial({
            uniforms: this.blackholeUniforms,
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec2 resolution;
                uniform float radius;
                uniform float distortionStrength;
                varying vec2 vUv;

                void main() {
                    vec2 center = vec2(0.5);
                    vec2 p = (vUv - center) * 2.0;
                    float dist = length(p);
                    float angle = atan(p.y, p.x) + time;
                    
                    float strength = smoothstep(radius, 0.0, dist);
                    vec2 distortion = vec2(cos(angle), sin(angle)) * strength * distortionStrength;
                    
                    gl_FragColor = vec4(0.0, 0.0, 0.0, strength * 0.8);
                }
            `,
            transparent: true,
            depthWrite: false
        });

        this.blackholeMesh = new THREE.Mesh(geometry, material);
        this.blackholeMesh.frustumCulled = false;
        this.scene.add(this.blackholeMesh);
    }

    /**
     * Update camera position based on current rotation and distance
     */
    updateCameraPosition() {
        if (!this.camera) return;

        const phi = THREE.MathUtils.degToRad(this.currentRotation.y + 90);
        const theta = THREE.MathUtils.degToRad(this.currentRotation.x);

        this.camera.position.x = this.cameraDistance * Math.sin(phi) * Math.cos(theta);
        this.camera.position.y = this.cameraDistance * Math.cos(phi);
        this.camera.position.z = this.cameraDistance * Math.sin(phi) * Math.sin(theta);

        this.camera.lookAt(0, 0, 0);
        this.camera.updateProjectionMatrix();
    }

    /**
     * Handle window resize
     */
    handleResize() {
        if (!this.camera || !this.renderer || !this.canvasElement) return;

        const width = this.canvasElement.clientWidth;
        const height = this.canvasElement.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height, false);
        
        if (this.blackholeUniforms) {
            this.blackholeUniforms.resolution.value.set(width, height);
        }
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Resize handling
        this.resizeObserver = new ResizeObserver(this.handleResize);
        this.resizeObserver.observe(this.canvasElement);

        // Pointer events for camera control
        this.canvasElement.addEventListener('pointerdown', this.onPointerDown);
        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
        this.canvasElement.addEventListener('wheel', this.onMouseWheel);

        // Context loss handling
        this._boundContextLost = this.handleContextLost.bind(this);
        this._boundContextRestored = this.handleContextRestored.bind(this);
        this.canvasElement.addEventListener('webglcontextlost', this._boundContextLost);
        this.canvasElement.addEventListener('webglcontextrestored', this._boundContextRestored);
    }

    /**
     * Handle pointer (mouse/touch) down event
     */
    onPointerDown(event) {
        this.isDragging = true;
        this.previousMousePosition.x = event.clientX;
        this.previousMousePosition.y = event.clientY;
        this.canvasElement.style.cursor = 'grabbing';
    }

    /**
     * Handle pointer (mouse/touch) move event
     */
    onPointerMove(event) {
        if (!this.isDragging) return;

        const deltaX = event.clientX - this.previousMousePosition.x;
        const deltaY = event.clientY - this.previousMousePosition.y;

        this.targetRotation.x += deltaX * CAMERA_CONFIG.ROTATION_SPEED;
        this.targetRotation.y = THREE.MathUtils.clamp(
            this.targetRotation.y + deltaY * CAMERA_CONFIG.ROTATION_SPEED,
            -85,
            85
        );

        this.previousMousePosition.x = event.clientX;
        this.previousMousePosition.y = event.clientY;
    }

    /**
     * Handle pointer (mouse/touch) up event
     */
    onPointerUp() {
        this.isDragging = false;
        this.canvasElement.style.cursor = 'grab';
    }

    /**
     * Handle mouse wheel event
     */
    onMouseWheel(event) {
        const delta = -Math.sign(event.deltaY) * CAMERA_CONFIG.ZOOM_SPEED;
        this.cameraDistance = THREE.MathUtils.clamp(
            this.cameraDistance + delta,
            CAMERA_CONFIG.MIN_DISTANCE,
            CAMERA_CONFIG.MAX_DISTANCE
        );
        event.preventDefault();
    }

    /**
     * Handle WebGL context loss
     */
    handleContextLost(event) {
        event.preventDefault();
        this.isActive = false;
        if (this.debug && typeof this.debug.track === 'function') {
            this.debug.track('WebGL', 'Context Lost - Saving State');
        }
        // Save current state
        this.savedState = {
            cameraPosition: this.camera?.position?.clone(),
            cameraRotation: { ...this.currentRotation },
            cameraDistance: this.cameraDistance
        };
        // Notify UI if available
        if (this.ui && typeof this.ui.showError === 'function' && this.i18n && typeof this.i18n.t === 'function') {
            this.ui.showError(this.i18n.t('errors.webglContextLost'), true);
        }
    }

    /**
     * Handle WebGL context restoration
     */
    async handleContextRestored() {
        if (this.debug && typeof this.debug.track === 'function') {
            this.debug.track('WebGL', 'Context Restored - Reinitializing');
        }
        
        try {
            // Reinitialize renderer
            await this.init();
            
            // Restore saved state
            if (this.savedState) {
                if (this.savedState.cameraPosition) {
                    this.camera.position.copy(this.savedState.cameraPosition);
                }
                this.currentRotation = { ...this.savedState.cameraRotation };
                this.targetRotation = { ...this.savedState.cameraRotation };
                this.cameraDistance = this.savedState.cameraDistance;
            }
            
            // Hide error if UI is available
            if (this.ui && typeof this.ui.hideError === 'function') {
                this.ui.hideError();
            }
            if (this.debug && typeof this.debug.track === 'function') {
                this.debug.track('WebGL', 'Context Restored Successfully');
            }
        } catch (error) {
            if (this.debug && typeof this.debug.track === 'function') {
                this.debug.track('WebGL Error', 'Context Restoration Failed: ' + error.message);
            }
            if (this.ui && typeof this.ui.showError === 'function' && this.i18n && typeof this.i18n.t === 'function') {
                this.ui.showError(this.i18n.t('errors.webglContextRestoreFailed'));
            }
        }
    }

    /**
     * Clean up resources
     */
    dispose() {
        // Prevent double-dispose
        if (!this.scene && !this.renderer && !this.camera) return;
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        this.canvasElement?.removeEventListener('pointerdown', this.onPointerDown);
        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
        this.canvasElement?.removeEventListener('wheel', this.onMouseWheel);
        // Remove context loss/restoration listeners using the same bound references
        if (this.canvasElement) {
            if (this._boundContextLost) this.canvasElement.removeEventListener('webglcontextlost', this._boundContextLost);
            if (this._boundContextRestored) this.canvasElement.removeEventListener('webglcontextrestored', this._boundContextRestored);
        }

        // Dispose of scene objects
        if (this.scene) {
            this.scene.traverse(object => {
                if (object.geometry) {
                    object.geometry.dispose();
                }
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => this.disposeMaterial(material));
                    } else {
                        this.disposeMaterial(object.material);
                    }
                }
            });
        }

        // Clean up renderer
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer.forceContextLoss();
            this.renderer = null;
        }

        // Clear references
        this.scene = null;
        this.camera = null;
        this.cubeWireframe = null;
        this.blackholeMesh = null;
        this.blackholeUniforms = null;
        this.savedState = null;
        this.isActive = false;

        if (this.debug && typeof this.debug.track === 'function') {
            this.debug.track('WebGL', 'Resources disposed');
        }
    }

    disposeMaterial(material) {
        if (!material) return;

        // Dispose of material properties
        Object.keys(material).forEach(key => {
            if (material[key] && typeof material[key].dispose === 'function') {
                material[key].dispose();
            }
        });

        // Dispose of the material itself
        material.dispose();
    }

    /**
     * Public methods for scene management
     */
    addMesh(mesh) {
        this.scene.add(mesh);
    }

    removeMesh(mesh) {
        this.scene.remove(mesh);
    }

    setBlackholeVisibility(visible) {
        if (this.blackholeMesh) {
            this.blackholeMesh.visible = visible;
        }
    }

    updateBlackholeUniforms(time) {
        if (this.blackholeUniforms) {
            this.blackholeUniforms.time.value = time;
            this.blackholeUniforms.resolution.value.set(
                this.canvasElement.width,
                this.canvasElement.height
            );
        }
    }

    isContextActive() {
        return this.isActive;
    }

    /**
     * Render the scene
     */
    render() {
        if (!this.isActive) return;
        
        const currentTime = performance.now();
        const deltaTime = currentTime - this.lastFrameTime;
        
        // Frame rate limiting
        if (deltaTime < this.frameInterval) return;
        
        // Performance monitoring
        this.frameTimes[this.frameTimeIndex] = deltaTime;
        this.frameTimeIndex = (this.frameTimeIndex + 1) % this.frameTimes.length;
        this.frameCount++;
        
        if (this.frameCount % 60 === 0) {
            const avgFrameTime = this.frameTimes.reduce((a, b) => a + b) / this.frameTimes.length;
            const fps = 1000 / avgFrameTime;
            this.debug.track('FPS', Math.round(fps));
        }
        
        // Smooth camera rotation
        this.currentRotation.x += (this.targetRotation.x - this.currentRotation.x) * 0.1;
        this.currentRotation.y += (this.targetRotation.y - this.currentRotation.y) * 0.1;
        
        this.updateCameraPosition();
        this.renderer.render(this.scene, this.camera);
        
        this.lastFrameTime = currentTime;
    }
}
