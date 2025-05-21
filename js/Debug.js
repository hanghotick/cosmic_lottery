export class Debug {
    constructor() {
        this.enabled = false;
        this.overlay = null;
        this.infoElement = null;
        this.perfElement = null;
        this.metrics = new Map();
        this.lastUpdate = performance.now();
        this.frameCount = 0;
    }

    init() {
        this.overlay = document.getElementById('debugOverlay');
        this.infoElement = document.getElementById('debugInfo');
        this.perfElement = document.getElementById('debugPerformance');
        
        // Add keyboard shortcut (Ctrl+Shift+D) to toggle debug overlay
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                this.toggle();
            }
        });

        // Initialize performance monitoring
        this.initPerformanceMonitoring();
    }

    toggle() {
        this.enabled = !this.enabled;
        this.overlay.classList.toggle('show', this.enabled);
    }

    updateInfo(data) {
        if (!this.enabled) return;
        
        const info = Object.entries(data)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');
        
        this.infoElement.textContent = info;
    }

    track(key, value) {
        this.metrics.set(key, value);
        if (this.enabled) this.updateMetrics();
    }

    updateMetrics() {
        this.frameCount++;
        const now = performance.now();
        
        // Update every 500ms
        if (now - this.lastUpdate > 500) {
            const fps = Math.round((this.frameCount * 1000) / (now - this.lastUpdate));
            this.frameCount = 0;
            this.lastUpdate = now;

            const metrics = Array.from(this.metrics.entries())
                .map(([key, value]) => {
                    const indicator = this.getIndicator(value);
                    return `${indicator} ${key}: ${value}`;
                })
                .join('\n');

            this.perfElement.innerHTML = `FPS: ${fps}\n${metrics}`;
        }
    }

    getIndicator(value) {
        if (typeof value === 'number') {
            return `<span class="debug-indicator ${
                value > 55 ? 'success' :
                value > 30 ? 'warning' : 'error'
            }"></span>`;
        }
        return '<span class="debug-indicator success"></span>';
    }

    initPerformanceMonitoring() {
        // Monitor memory usage if available
        if (window.performance?.memory) {
            setInterval(() => {
                const memory = window.performance.memory;
                this.track('JS Heap Size', 
                    `${Math.round(memory.usedJSHeapSize / (1024 * 1024))}MB / ${
                        Math.round(memory.jsHeapSizeLimit / (1024 * 1024))}MB`
                );
            }, 1000);
        }

        // Monitor frame timing
        let lastFrameTime = performance.now();
        const frameTimes = [];
        
        const updateFrame = () => {
            const now = performance.now();
            const frameTime = now - lastFrameTime;
            lastFrameTime = now;

            // Keep last 60 frame times
            frameTimes.push(frameTime);
            if (frameTimes.length > 60) frameTimes.shift();

            // Calculate average frame time
            const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
            this.track('Avg Frame Time', `${Math.round(avgFrameTime)}ms`);

            requestAnimationFrame(updateFrame);
        };

        requestAnimationFrame(updateFrame);
    }
}
