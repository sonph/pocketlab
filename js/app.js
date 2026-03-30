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
