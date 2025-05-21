export class LanguageManager {
    constructor() {
        this.translations = null;
        this.currentLanguage = 'en';
        this.loadingPromise = null;
    }

    async init(defaultLanguage = 'en') {
        if (!this.translations) {
            try {
                const response = await fetch('js/i18n/translations.json');
                this.translations = await response.json();
                this.currentLanguage = defaultLanguage;
            } catch (error) {
                console.error('Failed to load translations:', error);
                throw error;
            }
        }
    }

    async setLanguage(lang) {
        if (!this.translations || !this.translations[lang]) {
            await this.init(lang);
        }
        this.currentLanguage = lang;
        return this.translations[lang];
    }

    t(key, replacements = {}) {
        if (!this.translations) return key;

        // Split the key path (e.g., "buttons.start.initial" -> ["buttons", "start", "initial"])
        const keys = key.split('.');
        let value = this.translations[this.currentLanguage];

        // Traverse the translations object
        for (const k of keys) {
            value = value?.[k];
            if (value === undefined) return key;
        }

        // Replace placeholders
        return Object.entries(replacements).reduce(
            (text, [key, val]) => text.replace(`{${key}}`, val),
            value
        );
    }

    async updateUIText() {
        // Update page title
        document.title = this.t('gameTitle');
        document.querySelector('.sidebar-content h1').textContent = this.t('gameTitle');

        // Update labels
        document.getElementById('labelLanguageSelect').textContent = this.t('labels.language');
        document.getElementById('labelZoomSlider').textContent = this.t('labels.zoom');
        document.getElementById('labelMaxNumberInput').textContent = this.t('labels.maxNumber');
        document.getElementById('labelNumLuckyNumbers').textContent = this.t('labels.numLuckyNumbers');

        // Update buttons based on current state
        this.updateButtonStates();
    }

    updateButtonStates(phase = 'initial') {
        const startButton = document.getElementById('startButton');
        const restartButton = document.getElementById('restartButton');

        startButton.textContent = this.t(`buttons.start.${phase}`);
        restartButton.textContent = this.t('buttons.restart.initial');

        // Update other UI elements based on phase
        const statusOutput = document.getElementById('statusOutput');
        statusOutput.textContent = this.t(`status.${phase}`);
    }
}
