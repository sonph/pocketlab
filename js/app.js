/**
 * Pocket Lab Core Application
 * Core initialization for Web MIDI and visualizations.
 */

class PocketLabApp {
    constructor() {
        this.init();
    }

    init() {
        console.log("Pocket Lab Application initialized.");
        this.setupMidi();
        this.setupCanvas();
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
