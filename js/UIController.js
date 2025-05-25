// UIController.js - Manages UI state and updates (IMPROVED)
import { i18n } from './i18n/LanguageManager.js';
import { ANIMATION_CONFIG } from './config.js';

/**
 * Manages the game's UI elements and user interactions
 */
export class UIController {
    constructor(debug) {
        this.debug = debug;
        this.i18n = i18n;
        
        // Ensure initialization before binding elements
        try {
            // Initialize state
            this.simulationController = null;
            this.webglManager = null;
            this.i18nElements = null;
            this.eventListeners = [];
            
            // Initialize UI elements first
            this.initializeElements();
            
            // Create progress elements early
            this.createProgressElements();
            
            // Cache i18n elements
            this.cacheI18nElements();
            
            // Bind events last, after all elements are ready
            this.bindEvents();
            
            this.debug.track('UI', 'Initialization complete');
        } catch (error) {
            this.debug.track('UI Error', `Initialization failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Initialize UI elements with validation
     */
    initializeElements() {
        // Required element IDs
        const requiredElements = [
            'startButton',
            'restartButton',
            'statusOutput',
            'maxNumberInput',
            'numLuckyNumbersInput',
            'zoomSlider',
            'messageBox',
            'messageText',
            'messageBoxOkButton',
            'messageBoxNewGameButton',
            'loadingOverlay',
            'debugOverlay',
            'sidebarToggleButton',
            'sidebar',
            'languageSelect'
        ];

        // Initialize elements object
        this.elements = {};

        // Get and validate each element
        for (const id of requiredElements) {
            const element = document.getElementById(id);
            if (!element) {
                throw new Error(`Required UI element not found: ${id}`);
            }
            this.elements[id] = element;
        }

        // Initialize dynamic elements as null
        this.elements.phaseProgress = null;
        this.elements.phaseLabel = null;

        // Set initial button states
        this.elements.startButton.disabled = false;
        this.elements.restartButton.disabled = true;

        // Set initial input states
        this.elements.maxNumberInput.disabled = false;
        this.elements.numLuckyNumbersInput.disabled = false;
        this.elements.zoomSlider.disabled = true;

        this.debug.track('UI', 'Elements initialized');
    }

    /**
     * Cache elements with data-i18n attributes for performance
     */
    cacheI18nElements() {
        this.i18nElements = document.querySelectorAll('[data-i18n]');
    }

    /**
     * Cleanup method to prevent memory leaks
     */
    destroy() {
        // Remove all event listeners
        this.eventListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.eventListeners = [];
        
        // Remove dynamically created elements
        if (this.elements.phaseProgress && this.elements.phaseProgress.parentNode) {
            this.elements.phaseProgress.parentNode.removeChild(this.elements.phaseProgress);
        }
        if (this.elements.phaseLabel && this.elements.phaseLabel.parentNode) {
            this.elements.phaseLabel.parentNode.removeChild(this.elements.phaseLabel);
        }
        
        this.debug.track('UI', 'Destroyed successfully');
    }

    /**
     * Helper to safely add event listener with cleanup tracking
     */
    addEventListenerWithCleanup(element, event, handler, options = false) {
        if (!element) {
            this.debug.track('UI Warning', `Attempted to bind event to non-existent element: ${event}`);
            return;
        }

        // Wrap handler to ensure proper error tracking
        const wrappedHandler = async (e) => {
            try {
                await handler(e);
            } catch (error) {
                this.debug.track('Event Error', `${event} handler failed: ${error.message}`);
                this.showError(this.i18n.t('errors.operationFailed'));
            }
        };

        // Bind and track the event
        element.addEventListener(event, wrappedHandler, options);
        this.eventListeners.push({
            element,
            event,
            handler: wrappedHandler
        });

        this.debug.track('UI', `Event bound: ${event}`);
    }

    /**
     * Set simulation and WebGL controller references
     */
    setControllers(simulationController, webglManager) {
        try {
            this.simulationController = simulationController;
            this.webglManager = webglManager;

            if (!this.simulationController || !this.webglManager) {
                throw new Error('Missing required controllers');
            }

            if (!this.webglManager.isWebGLAvailable()) {
                throw new Error('WebGL not available');
            }

            // Initialize graphics asynchronously to avoid blocking
            this.webglManager.initializeGraphics().catch(error => {
                this.debug.track('Graphics Error', error.message);
                this.showError(this.i18n.t('errors.graphicsInitFailed'));
            });

            this.debug.track('UI', 'Controllers set successfully');
        } catch (error) {
            this.debug.track('UI Error', `Failed to set controllers: ${error.message}`);
            throw error;
        }
    }

    /**
     * Show a message in the message box (CONSISTENT VERSION)
     * @param {string} message - The message to display
     * @param {boolean} showNewGameButton - Whether to show the new game button
     * @param {boolean} isError - Whether this is an error message
     */
    showMessageBox(message, showNewGameButton = false, isError = false) {
        // Consistent: Always use textContent for security, add styling via CSS classes
        this.elements.messageText.textContent = message;
        
        // Consistent: Use CSS classes instead of direct style manipulation
        this.elements.messageBox.classList.add('show');
        if (isError) {
            this.elements.messageBox.classList.add('error');
        } else {
            this.elements.messageBox.classList.remove('error');
        }
        
        // Button visibility
        this.elements.messageBoxNewGameButton.style.display = showNewGameButton ? 'inline-block' : 'none';
        this.elements.messageBoxOkButton.style.display = showNewGameButton ? 'none' : 'inline-block';
    }

    /**
     * Hide the message box (CONSISTENT VERSION)
     */
    hideMessageBox() {
        this.elements.messageBox.classList.remove('show', 'error');
    }

    /**
     * Show an error message (SINGLE CONSISTENT VERSION)
     * @param {string} message - The error message to display
     */
    showError(message) {
        this.showMessageBox(message, false, true);
    }

    /**
     * Show success message (CONSISTENT VERSION)
     */
    showSuccess(message, showNewGame = false) {
        this.showMessageBox(message, showNewGame, false);
    }

    /**
     * Update UI text for the given language (OPTIMIZED)
     * @param {string} lang - Language code
     */
    updateLanguage(lang) {
        // Update page title
        document.title = this.i18n.t('gameTitle');
        
        // Use cached elements for better performance
        this.i18nElements.forEach(element => {
            const key = element.dataset.i18n;
            element.textContent = this.i18n.t(key);
        });
        
        // Update button states based on current phase
        this.updateButtonStates();
        
        this.debug.track('Language', lang);
    }

    /**
     * Create progress elements
     */
    createProgressElements() {
        // Create phase progress bar
        const progressBar = document.createElement('div');
        progressBar.className = 'phase-progress';
        progressBar.innerHTML = '<div class="phase-progress-bar"></div>';
        document.body.appendChild(progressBar);
        this.elements.phaseProgress = progressBar;

        // Create phase label
        const phaseLabel = document.createElement('div');
        phaseLabel.className = 'phase-label';
        document.body.appendChild(phaseLabel);
        this.elements.phaseLabel = phaseLabel;
    }

    /**
     * Bind event listeners with improved error handling
     */
    bindEvents() {
        try {
            // Start button
            this.addEventListenerWithCleanup(
                this.elements.startButton,
                'click',
                () => {
                    if (!this.simulationController) {
                        throw new Error('Simulation controller not initialized');
                    }
                    const maxNumber = parseInt(this.elements.maxNumberInput.value);
                    const numLuckyNumbers = parseInt(this.elements.numLuckyNumbersInput.value);
                    
                    if (this.validateInputs(maxNumber, numLuckyNumbers)) {
                        this.updateButtonStates(true);
                        this.showLoading(true);
                        this.simulationController.startSimulation(maxNumber, numLuckyNumbers);
                    }
                }
            );

            // Restart button
            this.addEventListenerWithCleanup(
                this.elements.restartButton,
                'click',
                () => {
                    if (!this.simulationController) {
                        throw new Error('Simulation controller not initialized');
                    }
                    this.updateButtonStates(false);
                    this.simulationController.resetSimulation();
                    this.updateProgress(ANIMATION_CONFIG.PHASES.FLOATING, 0);
                }
            );

            // Message box buttons
            this.addEventListenerWithCleanup(
                this.elements.messageBoxOkButton,
                'click',
                () => this.hideMessageBox()
            );

            this.addEventListenerWithCleanup(
                this.elements.messageBoxNewGameButton,
                'click',
                () => {
                    this.hideMessageBox();
                    this.handleRestartClick();
                }
            );

            // Input validation
            ['maxNumberInput', 'numLuckyNumbersInput'].forEach(inputId => {
                this.addEventListenerWithCleanup(
                    this.elements[inputId],
                    'input',
                    (e) => this.validateNumberInput(e.target)
                );
            });

            // Language selection
            this.addEventListenerWithCleanup(
                this.elements.languageSelect,
                'change',
                (e) => {
                    this.i18n.setLanguage(e.target.value);
                    this.updateLanguage(e.target.value);
                }
            );

            // Zoom slider with debounce
            let zoomTimeout;
            this.addEventListenerWithCleanup(
                this.elements.zoomSlider,
                'input',
                (e) => {
                    if (zoomTimeout) clearTimeout(zoomTimeout);
                    zoomTimeout = setTimeout(() => {
                        if (this.webglManager) {
                            this.webglManager.updateCameraDistance(parseFloat(e.target.value));
                        }
                    }, 16); // Debounce to 60fps
                }
            );

            // Sidebar toggle
            this.addEventListenerWithCleanup(
                this.elements.sidebarToggleButton,
                'click',
                () => this.toggleSidebar()
            );

            this.debug.track('UI', 'All events bound successfully');
        } catch (error) {
            this.debug.track('UI Error', `Failed to bind events: ${error.message}`);
            throw error;
        }
    }

    /**
     * Handle start button click
     */
    handleStartClick() {
        if (!this.simulationController) return;

        const maxNumber = parseInt(this.elements.maxNumberInput.value);
        const numLuckyNumbers = parseInt(this.elements.numLuckyNumbersInput.value);

        if (this.validateInputs(maxNumber, numLuckyNumbers)) {
            this.updateButtonStates(true);
            this.showLoading(true);
            this.simulationController.startSimulation(maxNumber, numLuckyNumbers);
        }
    }

    /**
     * Handle restart button click
     */
    handleRestartClick() {
        if (!this.simulationController) return;

        this.updateButtonStates(false);
        this.simulationController.resetSimulation();
        this.updateProgress(ANIMATION_CONFIG.PHASES.FLOATING, 0);
    }

    /**
     * Handle new game button click
     */
    handleNewGameClick() {
        this.hideMessageBox();
        this.handleRestartClick();
    }

    /**
     * Handle language change
     */
    handleLanguageChange(event) {
        this.i18n.setLanguage(event.target.value);
    }

    /**
     * Handle zoom slider change
     */
    handleZoomChange(event) {
        if (this.webglManager) {
            this.webglManager.updateCameraDistance(parseFloat(event.target.value));
        }
    }

    /**
     * Validate number inputs
     */
    validateNumberInput(input) {
        const value = parseInt(input.value);
        const min = parseInt(input.min);
        const max = parseInt(input.max);
        
        if (isNaN(value) || value < min || value > max) {
            input.classList.add('invalid');
            return false;
        }
        
        input.classList.remove('invalid');
        return true;
    }

    /**
     * Validate all inputs
     */
    validateInputs(maxNumber, numLuckyNumbers) {
        if (isNaN(maxNumber) || maxNumber < 10 || maxNumber > 10000) {
            this.showError(this.i18n.t('errors.invalidMaxNumber'));
            return false;
        }

        if (isNaN(numLuckyNumbers) || numLuckyNumbers < 1 || numLuckyNumbers > 100) {
            this.showError(this.i18n.t('errors.invalidLuckyNumbers'));
            return false;
        }

        if (numLuckyNumbers > maxNumber) {
            this.showError(this.i18n.t('errors.tooManyLuckyNumbers'));
            return false;
        }

        return true;
    }

    /**
     * Show/hide loading overlay
     */
    showLoading(show) {
        this.elements.loadingOverlay.style.display = show ? 'flex' : 'none';
    }

    /**
     * Update button states with validation and proper state tracking
     */
    updateButtonStates(simulationStarted = false) {
        try {
            // Define button states
            const buttonStates = [
                {
                    element: this.elements.startButton,
                    disabled: simulationStarted,
                    ariaLabel: simulationStarted ? 'Simulation in progress' : 'Start simulation'
                },
                {
                    element: this.elements.restartButton,
                    disabled: !simulationStarted,
                    ariaLabel: simulationStarted ? 'Reset simulation' : 'Cannot reset yet'
                },
                {
                    element: this.elements.maxNumberInput,
                    disabled: simulationStarted,
                    ariaLabel: simulationStarted ? 'Number locked during simulation' : 'Enter maximum number'
                },
                {
                    element: this.elements.numLuckyNumbersInput,
                    disabled: simulationStarted,
                    ariaLabel: simulationStarted ? 'Number locked during simulation' : 'Enter lucky numbers count'
                },
                {
                    element: this.elements.zoomSlider,
                    disabled: !simulationStarted,
                    ariaLabel: simulationStarted ? 'Adjust view distance' : 'Zoom unavailable'
                }
            ];

            // Update each element's state
            buttonStates.forEach(({ element, disabled, ariaLabel }) => {
                if (element) {
                    element.disabled = disabled;
                    element.setAttribute('aria-disabled', disabled);
                    element.setAttribute('aria-label', ariaLabel);
                    
                    // Add visual feedback classes
                    element.classList.toggle('disabled', disabled);
                    element.classList.toggle('active', !disabled);
                }
            });

            // Update status text
            const status = simulationStarted ? 'running' : 'initial';
            if (this.elements.statusOutput) {
                this.elements.statusOutput.textContent = this.i18n.t(`status.${status}`);
                this.elements.statusOutput.setAttribute('aria-live', 'polite');
            }

            this.debug.track('UI', `Button states updated: ${status}`);
        } catch (error) {
            this.debug.track('UI Error', `Failed to update button states: ${error.message}`);
            // Continue execution despite error
        }
    }

    /**
     * Update progress indicators with validation and animation
     */
    updateProgress(phase, progress) {
        try {
            // Validate parameters
            if (!phase || !Object.values(ANIMATION_CONFIG.PHASES).includes(phase)) {
                throw new Error(`Invalid phase: ${phase}`);
            }
            
            progress = Math.max(0, Math.min(1, progress)); // Clamp between 0 and 1

            // Update progress bar with smooth animation
            if (this.elements.phaseProgress) {
                const bar = this.elements.phaseProgress.querySelector('.phase-progress-bar');
                if (bar) {
                    // Use CSS transition for smooth animation
                    bar.style.transition = 'width 0.2s ease-out';
                    bar.style.width = `${progress * 100}%`;
                }
                
                // Toggle visibility
                const shouldShow = phase !== ANIMATION_CONFIG.PHASES.FLOATING;
                this.elements.phaseProgress.classList.toggle('show', shouldShow);
            }

            // Update phase label with animation
            if (this.elements.phaseLabel) {
                const currentText = this.elements.phaseLabel.textContent;
                const newText = this.i18n.t(`phases.${phase}`);
                
                if (currentText !== newText) {
                    // Animate text change
                    this.elements.phaseLabel.style.opacity = '0';
                    setTimeout(() => {
                        this.elements.phaseLabel.textContent = newText;
                        this.elements.phaseLabel.style.opacity = '1';
                    }, 200);
                }
                
                this.elements.phaseLabel.classList.toggle('show', phase !== ANIMATION_CONFIG.PHASES.FLOATING);
            }

            // Update status text with proper ARIA attributes
            if (this.elements.statusOutput) {
                const statusText = this.i18n.t(`status.${phase}`);
                this.elements.statusOutput.textContent = statusText;
                this.elements.statusOutput.setAttribute('aria-live', 'polite');
                this.elements.statusOutput.setAttribute('role', 'status');
            }

            this.debug.track('Progress', `Phase: ${phase}, Progress: ${Math.round(progress * 100)}%`);
        } catch (error) {
            this.debug.track('UI Error', `Failed to update progress: ${error.message}`);
            // Continue execution despite error
        }
    }

    /**
     * Toggle sidebar visibility
     */
    toggleSidebar() {
        if (this.elements.sidebar) {
            this.elements.sidebar.classList.toggle('open');
        }
    }
}