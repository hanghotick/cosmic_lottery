// WebGLManager.js - Handles WebGL setup, restoration, and context loss.
import { CAMERA_CONFIG, PHYSICS_CONFIG } from './config.js';

/**
 * Manages WebGL context, including setup, context loss, and restoration
 */
export class WebGLManager {
    constructor(debug) {
        this.debug = debug;
        
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

            // Get canvas element
            this.canvasElement = document.getElementById('particleCanvas');
            if (!this.canvasElement) {
                throw new Error('Canvas element not found');
            }

            // Check WebGL support
            if (!this.isWebGLAvailable()) {
                throw new Error('WebGL is not supported in this browser');
            }

            // Scene setup
            this.scene = new THREE.Scene();
            this.scene.background = null; // Transparent background

            // Camera setup
            this.camera = new THREE.PerspectiveCamera(
                CAMERA_CONFIG.FOV,
                window.innerWidth / window.innerHeight,
                CAMERA_CONFIG.NEAR,
                CAMERA_CONFIG.FAR
            );
            this.updateCameraPosition();

            // Renderer setup with error checking
            try {
                this.renderer = new THREE.WebGLRenderer({
                    canvas: this.canvasElement,
                    antialias: true,
                    alpha: true,
                    powerPreference: "high-performance"
                });
            } catch (error) {
                throw new Error(`Failed to create WebGL renderer: ${error.message}`);
            }

            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for performance
            
            // Initial size setup
            this.handleResize();
            
            // Add event listeners
            this.setupEventListeners();
            
            // Create scene objects
            await this.createSceneObjects();
            
            this.isActive = true;
            this.debug.track('WebGL', 'Initialized successfully');
            return true;
        } catch (error) {
            this.debug.track('WebGL Error', error.message);
            this.isActive = false;
            throw error;
        }
    }

    /**
     * Check if WebGL is available
     */
    isWebGLAvailable() {
        try {
            const canvas = document.createElement('canvas');
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
        this.canvasElement.addEventListener('webglcontextlost', this.handleContextLost.bind(this));
        this.canvasElement.addEventListener('webglcontextrestored', this.handleContextRestored.bind(this));
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
        this.debug.track('WebGL', 'Context Lost');
    }

    /**
     * Handle WebGL context restoration
     */
    async handleContextRestored() {
        await this.init();
        this.debug.track('WebGL', 'Context Restored');
    }

    /**
     * Clean up resources
     */
    dispose() {
        // Remove event listeners
        this.resizeObserver?.disconnect();
        this.canvasElement?.removeEventListener('pointerdown', this.onPointerDown);
        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
        this.canvasElement?.removeEventListener('wheel', this.onMouseWheel);

        // Dispose of scene objects
        this.cubeWireframe?.geometry.dispose();
        this.cubeWireframe?.material.dispose();
        this.blackholeMesh?.geometry.dispose();
        this.blackholeMesh?.material.dispose();

        // Dispose of renderer
        this.renderer?.dispose();

        // Clear references
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.cubeWireframe = null;
        this.blackholeMesh = null;
        this.blackholeUniforms = null;
        this.canvasElement = null;
        this.isActive = false;

        this.debug.track('WebGL', 'Disposed');
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
        
        // Smooth camera rotation
        this.currentRotation.x += (this.targetRotation.x - this.currentRotation.x) * 0.1;
        this.currentRotation.y += (this.targetRotation.y - this.currentRotation.y) * 0.1;
        
        this.updateCameraPosition();
        this.renderer.render(this.scene, this.camera);
    }
}
