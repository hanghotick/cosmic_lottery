// UIController.js - Manages UI state and updates
import { i18n } from './i18n/LanguageManager.js';

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
            progressBar: null,
            progressLabel: null
        };

        // Bind event handlers
        this.messageBoxOkButton.onclick = () => this.hideMessageBox();
        this.debug.track('UI', 'Initialized');
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
        // Create progress bar container
        const container = document.createElement('div');
        container.className = 'progress-container';
        container.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);';

        // Create progress bar
        this.elements.progressBar = document.createElement('div');
        this.elements.progressBar.className = 'progress-bar';
        this.elements.progressBar.style.cssText = 'width:300px;height:10px;background:#1a1a1a;border-radius:5px;overflow:hidden;';

        // Create progress fill
        const progressFill = document.createElement('div');
        progressFill.className = 'progress-fill';
        progressFill.style.cssText = 'width:0%;height:100%;background:linear-gradient(90deg,#4f46e5,#818cf8);transition:width 0.3s ease;';
        
        // Create label
        this.elements.progressLabel = document.createElement('div');
        this.elements.progressLabel.className = 'progress-label';
        this.elements.progressLabel.style.cssText = 'color:#fff;text-align:center;margin-top:5px;font-size:14px;';
        
        // Assemble elements
        this.elements.progressBar.appendChild(progressFill);
        container.appendChild(this.elements.progressBar);
        container.appendChild(this.elements.progressLabel);
        document.body.appendChild(container);
        
        // Initially hidden
        container.style.display = 'none';
    }

    /**
     * Update progress display
     * @param {string} phase - Current phase name
     * @param {number} progress - Progress value (0-1)
     */
    updateProgress(phase, progress) {
        if (!this.elements.progressBar || !this.elements.progressLabel) return;

        const container = this.elements.progressBar.parentElement;
        container.style.display = 'block';
        
        const fill = this.elements.progressBar.querySelector('.progress-fill');
        fill.style.width = `${progress * 100}%`;
        
        this.elements.progressLabel.textContent = i18n.t(`progress.${phase}`, { 
            progress: Math.round(progress * 100) 
        });
    }

    /**
     * Hide progress elements
     */
    hideProgress() {
        if (!this.elements.progressBar) return;
        this.elements.progressBar.parentElement.style.display = 'none';
    }

    /**
     * Update button states based on simulation phase
     * @param {string} phase - Current simulation phase
     */
    updateButtonStates(phase = 'initial') {
        const startLabel = phase === 'initial' ? 'startButton' : 'startButtonDrawing';
        this.elements.startButton.textContent = i18n.t(`buttons.${startLabel}`);
        this.elements.restartButton.textContent = i18n.t('buttons.restart');

        // Update status text
        this.elements.statusOutput.textContent = i18n.t(`status.${phase}`);
    }

    /**
     * Show loading overlay
     */
    showLoading() {
        this.elements.loadingOverlay.style.display = 'flex';
    }

    /**
     * Hide loading overlay
     */
    hideLoading() {
        this.elements.loadingOverlay.style.display = 'none';
    }
}
