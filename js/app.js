import { Metronome } from './metronome.js';

/**
 * Pocket Lab Core Application
 * Core initialization for Web MIDI and visualizations.
 */

class PocketLabApp {
    constructor() {
        this.metronome = new Metronome();
        this.init();
    }

    init() {
        console.log("Pocket Lab Application initialized.");
        this.setupMetronomeUI();
        this.setupMidi();
        this.setupCanvas();
    }

    setupMetronomeUI() {
        const playBtn = document.getElementById('play-btn');
        const bpmInput = document.getElementById('bpm-input');
        const bpmSlider = document.getElementById('bpm-slider');
        
        if (playBtn) {
            playBtn.addEventListener('click', () => {
                this.metronome.startStop();
                playBtn.textContent = this.metronome.isPlaying ? 'Stop' : 'Play';
            });
        }
        
        const updateBpm = (val) => {
            let bpm = typeof val === 'string' ? parseInt(val, 10) : val;
            if (isNaN(bpm)) return;
            if (bpm < 40) bpm = 40;
            if (bpm > 300) bpm = 300;
            
            if (bpmInput) bpmInput.value = bpm;
            if (bpmSlider) bpmSlider.value = bpm;
            this.metronome.setBpm(bpm);
        };

        if (bpmInput) {
            bpmInput.addEventListener('input', (e) => updateBpm(e.target.value));
        }
        
        if (bpmSlider) {
            bpmSlider.addEventListener('input', (e) => updateBpm(e.target.value));
        }

        const stepBtns = document.querySelectorAll('.bpm-step');
        stepBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const step = parseInt(e.target.dataset.step, 10);
                updateBpm(this.metronome.bpm + step);
            });
        });

        // Advanced Config UI Bindings
        const bindSetting = (id, property, isNumber = false) => {
            const el = document.getElementById(id);
            if (!el) return;
            const handler = (e) => {
                let val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
                if (isNumber) val = Number(val);
                this.metronome.updateSettings({ [property]: val });
            };
            el.addEventListener('change', handler);
            el.addEventListener('input', handler); 
        };

        bindSetting('setting-intervalMode', 'intervalMode');
        bindSetting('setting-countInBars', 'countInBars', true);
        bindSetting('setting-voicing', 'voicing');
        bindSetting('setting-emphasis', 'emphasis');
        
        bindSetting('setting-gapRadioMode', 'gapRadioMode');
        bindSetting('setting-gapConstantOn', 'gapConstantOn', true);
        bindSetting('setting-gapConstantOff', 'gapConstantOff', true);
        bindSetting('setting-gapChaos', 'gapChaos', true);
        
        bindSetting('setting-shakyEnabled', 'shakyEnabled');
        bindSetting('setting-shakyRange', 'shakyRange', true);
        bindSetting('setting-shakyChance', 'shakyChance', true);

        // Timer Display Loop
        const timerDisplay = document.getElementById('timer-display');
        const barDisplay = document.getElementById('bar-display');
        
        this.metronome.onIntervalComplete = () => {
            if (playBtn) playBtn.textContent = 'Play';
            if (timerDisplay) timerDisplay.textContent = 'DONE';
        };

        const renderTimer = () => {
            if (this.metronome.isPlaying && this.metronome.sessionStartTime) {
                // Time
                const elapsedCtx = this.metronome.audioContext.currentTime - this.metronome.sessionStartTime;
                const m = Math.floor(elapsedCtx / 60);
                const s = Math.floor(elapsedCtx % 60);
                if (elapsedCtx >= 0 && timerDisplay) {
                    timerDisplay.textContent = `${m}:${s.toString().padStart(2, '0')}`;
                }
                // Bars
                if (barDisplay) {
                    const activeBars = this.metronome.currentBarTotal - this.metronome.countInBars + 1;
                    barDisplay.textContent = `BAR ${activeBars}`;
                }
            } else if (this.metronome.isPlaying && this.metronome.currentBarTotal < this.metronome.countInBars) {
                const barsLeft = this.metronome.countInBars - this.metronome.currentBarTotal;
                if (timerDisplay) timerDisplay.textContent = `-IN: ${barsLeft} BAR(S)`;
                if (barDisplay) barDisplay.textContent = 'BAR --';
            } else if (!this.metronome.isPlaying) {
                if (timerDisplay && timerDisplay.textContent !== 'DONE') timerDisplay.textContent = '0:00';
                if (barDisplay) barDisplay.textContent = 'BAR 1';
            }
            requestAnimationFrame(renderTimer);
        };
        requestAnimationFrame(renderTimer);
    }

    setupMidi() {
        // Initialize Web MIDI API
        if (navigator.requestMIDIAccess) {
            navigator.requestMIDIAccess({ sysex: false })
                .then(this.onMIDISuccess.bind(this), this.onMIDIFailure.bind(this));
        } else {
            console.warn("Web MIDI API not supported in this browser.");
        }
    }

    onMIDISuccess(midiAccess) {
        console.log("MIDI Access granted.");
        // Setup MIDI logic later
    }

    onMIDIFailure(error) {
        console.error("Failed to access MIDI devices.", error);
    }

    setupCanvas() {
        // Initialize Canvas API/SVG rendering
        console.log("Canvas setup initialized.");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.pocketLabApp = new PocketLabApp();
});
