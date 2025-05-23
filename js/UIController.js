// UIController.js - Manages UI state and updates
import { i18n } from './i18n/LanguageManager.js';
import { ANIMATION_CONFIG } from './config.js';

/**
 * Manages the game's UI elements and user interactions
 */
export class UIController {
    constructor(debug) {
        this.debug = debug;
        
        // DOM element references
        this.elements = {
            startButton: document.getElementById('startButton'),
            restartButton: document.getElementById('restartButton'),
            statusOutput: document.getElementById('statusOutput'),
            maxNumberInput: document.getElementById('maxNumberInput'),
            numLuckyNumbersInput: document.getElementById('numLuckyNumbersInput'),
            zoomSlider: document.getElementById('zoomSlider'),
            messageBox: document.getElementById('messageBox'),
            messageText: document.getElementById('messageText'),
            messageBoxOkButton: document.getElementById('messageBoxOkButton'),
            messageBoxNewGameButton: document.getElementById('messageBoxNewGameButton'),
            loadingOverlay: document.getElementById('loadingOverlay'),
            debugOverlay: document.getElementById('debugOverlay'),
            sidebarToggleButton: document.getElementById('sidebarToggleButton'),
            sidebar: document.getElementById('sidebar'),
            languageSelect: document.getElementById('languageSelect'),
            phaseProgress: null,
            phaseLabel: null
        };

        // Validate required elements
        for (const [key, element] of Object.entries(this.elements)) {
            if (element === null && !['phaseProgress', 'phaseLabel'].includes(key)) {
                this.debug.track('UI Error', `Missing required element: ${key}`);
                throw new Error(`Required UI element not found: ${key}`);
            }
        }

        this.simulationController = null;
        this.webglManager = null;
        
        // Create phase progress elements
        try {
            this.createProgressElements();
            // Bind event handlers
            this.bindEvents();
            this.debug.track('UI', 'Initialized successfully');
        } catch (error) {
            this.debug.track('UI Error', `Initialization failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Set simulation and WebGL controller references
     */
    setControllers(simulationController, webglManager) {
        try {
            // Store controller references
            this.simulationController = simulationController;
            this.webglManager = webglManager;

            if (!this.simulationController || !this.webglManager) {
                throw new Error('Missing required controllers');
            }

            // Verify WebGL support and initialization
            if (!this.webglManager.isWebGLAvailable()) {
                throw new Error('WebGL not available');
            }

            // Initialize graphics if not already done
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
     * Show a message in the message box
     * @param {string} message - The message to display
     * @param {boolean} showNewGameButton - Whether to show the new game button
     */
    showMessageBox(message, showNewGameButton = false) {
        this.elements.messageText.innerHTML = message;
        this.elements.messageBox.style.display = 'block';
        this.elements.messageBoxNewGameButton.style.display = showNewGameButton ? 'inline-block' : 'none';
    }

    /**
     * Hide the message box
     */
    hideMessageBox() {
        this.elements.messageBox.style.display = 'none';
        this.elements.messageBoxNewGameButton.style.display = 'none';
    }

    /**
     * Show an error message
     * @param {string} message - The error message to display
     */
    showError(message) {
        this.showMessageBox(`<span style='color:#ef4444;'>${message}</span>`);
    }

    /**
     * Update UI text for the given language
     * @param {string} lang - Language code
     */
    updateLanguage(lang) {
        // Update page title
        document.title = i18n.t('gameTitle');
        
        // Update labels
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.dataset.i18n;
            element.textContent = i18n.t(key);
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
     * Bind event listeners
     */
    bindEvents() {
        try {
            // Button events with error handling
            if (this.elements.startButton) {
                this.elements.startButton.addEventListener('click', () => {
                    try {
                        this.handleStartClick();
                    } catch (error) {
                        this.debug.track('Start Error', error.message);
                        this.showError(this.i18n.t('errors.startFailed'));
                    }
                });
            }
            
            if (this.elements.restartButton) {
                this.elements.restartButton.addEventListener('click', () => {
                    try {
                        this.handleRestartClick();
                    } catch (error) {
                        this.debug.track('Restart Error', error.message);
                        this.showError(this.i18n.t('errors.restartFailed'));
                    }
                });
            }

            // Message box buttons
            if (this.elements.messageBoxOkButton) {
                this.elements.messageBoxOkButton.addEventListener('click', () => this.hideMessageBox());
            }
            
            if (this.elements.messageBoxNewGameButton) {
                this.elements.messageBoxNewGameButton.addEventListener('click', () => {
                    try {
                        this.handleNewGameClick();
                    } catch (error) {
                        this.debug.track('New Game Error', error.message);
                        this.showError(this.i18n.t('errors.newGameFailed'));
                    }
                });
            }

            // Sidebar toggle
            if (this.elements.sidebarToggleButton) {
                this.elements.sidebarToggleButton.addEventListener('click', () => this.toggleSidebar());
            }

            // Input validation
            if (this.elements.maxNumberInput) {
                this.elements.maxNumberInput.addEventListener('input', (e) => this.validateNumberInput(e.target));
            }
            
            if (this.elements.numLuckyNumbersInput) {
                this.elements.numLuckyNumbersInput.addEventListener('input', (e) => this.validateNumberInput(e.target));
            }

            // Language selection
            if (this.elements.languageSelect) {
                this.elements.languageSelect.addEventListener('change', (e) => {
                    try {
                        this.handleLanguageChange(e);
                    } catch (error) {
                        this.debug.track('Language Error', error.message);
                        this.showError(this.i18n.t('errors.languageChangeFailed'));
                    }
                });
            }

            // Camera zoom
            if (this.elements.zoomSlider) {
                this.elements.zoomSlider.addEventListener('input', (e) => {
                    try {
                        this.handleZoomChange(e);
                    } catch (error) {
                        this.debug.track('Zoom Error', error.message);
                    }
                });
            }

            this.debug.track('UI', 'Events bound successfully');
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
     * Show error message
     */
    showError(message) {
        this.elements.messageText.textContent = message;
        this.elements.messageBoxNewGameButton.style.display = 'none';
        this.elements.messageBoxOkButton.style.display = 'block';
        this.elements.messageBox.classList.add('show');
    }

    /**
     * Show success message
     */
    showSuccess(message, showNewGame = false) {
        this.elements.messageText.textContent = message;
        this.elements.messageBoxNewGameButton.style.display = showNewGame ? 'block' : 'none';
        this.elements.messageBoxOkButton.style.display = showNewGame ? 'none' : 'block';
        this.elements.messageBox.classList.add('show');
    }

    /**
     * Hide message box
     */
    hideMessageBox() {
        this.elements.messageBox.classList.remove('show');
    }

    /**
     * Show/hide loading overlay
     */
    showLoading(show) {
        this.elements.loadingOverlay.style.display = show ? 'flex' : 'none';
    }

    /**
     * Update button states
     */
    updateButtonStates(simulationStarted) {
        try {
            if (this.elements.startButton) {
                this.elements.startButton.disabled = simulationStarted;
                this.elements.startButton.setAttribute('aria-disabled', simulationStarted);
            }
            
            if (this.elements.restartButton) {
                this.elements.restartButton.disabled = !simulationStarted;
                this.elements.restartButton.setAttribute('aria-disabled', !simulationStarted);
            }
            
            if (this.elements.maxNumberInput) {
                this.elements.maxNumberInput.disabled = simulationStarted;
                this.elements.maxNumberInput.setAttribute('aria-disabled', simulationStarted);
            }
            
            if (this.elements.numLuckyNumbersInput) {
                this.elements.numLuckyNumbersInput.disabled = simulationStarted;
                this.elements.numLuckyNumbersInput.setAttribute('aria-disabled', simulationStarted);
            }

            // Update other UI elements based on simulation state
            if (this.elements.zoomSlider) {
                this.elements.zoomSlider.disabled = !simulationStarted;
            }

            // Update status message
            if (this.elements.statusOutput) {
                const status = simulationStarted ? 'running' : 'initial';
                this.elements.statusOutput.textContent = this.i18n.t(`status.${status}`);
            }

            this.debug.track('UI', `Button states updated: ${simulationStarted ? 'running' : 'stopped'}`);
        } catch (error) {
            this.debug.track('UI Error', `Failed to update button states: ${error.message}`);
            // Don't throw here as this is not critical
        }
    }

    /**
     * Update progress indicators
     */
    updateProgress(phase, progress) {
        // Update progress bar
        if (this.elements.phaseProgress) {
            const bar = this.elements.phaseProgress.querySelector('.phase-progress-bar');
            if (bar) {
                bar.style.width = `${progress * 100}%`;
            }
            this.elements.phaseProgress.classList.toggle('show', phase !== ANIMATION_CONFIG.PHASES.FLOATING);
        }

        // Update phase label
        if (this.elements.phaseLabel) {
            this.elements.phaseLabel.textContent = this.i18n.t(`phases.${phase}`);
            this.elements.phaseLabel.classList.toggle('show', phase !== ANIMATION_CONFIG.PHASES.FLOATING);
        }

        // Update status text
        this.elements.statusOutput.textContent = this.i18n.t(`status.${phase}`);
    }

    /**
     * Toggle sidebar visibility
     */
    toggleSidebar() {
        this.elements.sidebar.classList.toggle('open');
    }
}
