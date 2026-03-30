export class MidiEngine {
    constructor() {
        this.midiAccess = null;
        this.inputs = [];
        this.ghostThreshold = 1; // 0-127
        this.latencySys = 0; // ms offset
        
        // Listeners for external hookups
        this.onHit = null; // (hitDetails) => {}
        this.onLiveMapComplete = null; // (instrument, noteIdsArray) => {}
        this.onCalibrationHit = null; // (offset, avg, remaining) => {}
        this.onMidiLog = null; // (logString) => {}
        
        // System state
        this.isCalibrating = false;
        this.calibrationHits = [];
        this.calibrationExpectedTime = 0;
        
        this.liveMapTarget = null;

        // Logging state
        this.isLoggingEnabled = false;
        this.logLevel = 1; // 1: Note On, 2: MIDI Events, 3: Everything

        // Default Mappings Definition
        this.mappings = {
            'kick': { noteIds: [36], shape: 'circle', color: '#10B981', name: 'Kick' },
            'snare': { noteIds: [38], shape: 'square', color: '#F59E0B', name: 'Snare' },
            'hihat': { noteIds: [42], shape: 'triangle', color: '#38BDF8', name: 'Hi-Hat' }
        };
    }

    async init() {
        try {
            this.midiAccess = await navigator.requestMIDIAccess();
            this.midiAccess.onstatechange = this.refreshInputs.bind(this);
            this.refreshInputs();
            return true;
        } catch (e) {
            console.warn("Web MIDI not supported or denied by user.", e);
            return false;
        }
    }

    refreshInputs() {
        this.inputs = [];
        if (!this.midiAccess) return;
        for (const input of this.midiAccess.inputs.values()) {
            input.onmidimessage = this.handleMidiMessage.bind(this);
            this.inputs.push(input);
        }
    }

    handleMidiMessage(event) {
        const cmd = event.data[0] >> 4;
        const note = event.data[1];
        const velocity = event.data.length > 2 ? event.data[2] : 0;
        const rawStatus = event.data[0];

        // Format a standard time string
        const d = new Date();
        const timeStr = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}.${d.getMilliseconds().toString().padStart(3,'0')}`;

        // Determine matching instrument
        let matchedInstrument = "Unmapped";
        for (const [id, config] of Object.entries(this.mappings)) {
            if (config.noteIds.includes(note)) {
                matchedInstrument = config.name;
                break;
            }
        }

        // --- Logging Layer ---
        if (this.isLoggingEnabled && this.onMidiLog) {
            let shouldLog = false;
            let logMsg = "";

            if (this.logLevel === 1) { // Only Note On
                if (cmd === 9 && velocity > 0) {
                    shouldLog = true;
                    logMsg = `[Note On] Note: ${note} | Vel: ${velocity} -> ${matchedInstrument}`;
                }
            } else if (this.logLevel === 2) { // Standard MIDI Events (No Clock/Sensing)
                if (rawStatus !== 248 && rawStatus !== 254) {
                    shouldLog = true;
                    if (cmd === 9 && velocity > 0) logMsg = `[Note On] Note: ${note} | Vel: ${velocity} -> ${matchedInstrument}`;
                    else if (cmd === 8 || (cmd === 9 && velocity === 0)) logMsg = `[Note Off] Note: ${note}`;
                    else if (cmd === 11) logMsg = `[Control] CC: ${note} | Val: ${velocity}`;
                    else if (cmd === 14) logMsg = `[PitchBend] Val1: ${note} | Val2: ${velocity}`;
                    else logMsg = `[Event] Cmd: ${cmd} | Data1: ${note} | Data2: ${velocity}`;
                }
            } else if (this.logLevel === 3) { // Everything
                shouldLog = true;
                logMsg = `[Raw ${rawStatus}] D1: ${note} | D2: ${velocity}`;
            }

            if (shouldLog) {
                this.onMidiLog(`[${timeStr}] ${logMsg}`);
            }
        }

        // --- Core Routing ---
        if (cmd === 9 && velocity > 0) {
            // 1. Ghost Note Velocity Filter
            if (velocity < this.ghostThreshold) {
                if (this.isLoggingEnabled && this.onMidiLog && this.logLevel >= 1) {
                    this.onMidiLog(`   -> Dropped by Ghost Filter (Vel < ${this.ghostThreshold})`);
                }
                return;
            }

            // 2. Live Mapping (Registration) intercept layer
            if (this.liveMapTarget) {
                // Determine if note already exists to prevent duplicate array entries
                if (!this.mappings[this.liveMapTarget].noteIds.includes(note)) {
                    this.mappings[this.liveMapTarget].noteIds.push(note);
                }
                const mappedId = this.liveMapTarget;
                this.liveMapTarget = null;
                if (this.onLiveMapComplete) this.onLiveMapComplete(mappedId, this.mappings[mappedId].noteIds);
                return;
            }

            // 3. Calibration Layer intercept
            if (this.isCalibrating && this.calibrationExpectedTime > 0) {
                this.handleCalibrationHit(event.timeStamp);
                return;
            }

            // 4. Normal Engine Routing
            for (const [instrumentId, config] of Object.entries(this.mappings)) {
                if (config.noteIds.includes(note)) {
                    if (this.onHit) {
                        this.onHit({
                            instrument: instrumentId,
                            velocity: velocity,
                            rawTimestamp: event.timeStamp, 
                            config: config
                        });
                    }
                    break;
                }
            }
        }
    }

    // --- State Handlers ---

    listenForMap(instrumentId) {
        if (this.mappings[instrumentId]) {
            this.liveMapTarget = instrumentId;
        }
    }

    clearMap(instrumentId) {
        if (this.mappings[instrumentId]) {
            this.mappings[instrumentId].noteIds = [];
        }
    }

    updateMap(instrumentId, noteIdsArray, shape, color) {
        if (!this.mappings[instrumentId]) return;
        if (noteIdsArray !== undefined && noteIdsArray !== null) {
            this.mappings[instrumentId].noteIds = noteIdsArray;
        }
        if (shape) this.mappings[instrumentId].shape = shape;
        if (color) this.mappings[instrumentId].color = color;
    }

    // --- Calibration Logic ---

    startCalibration() {
        this.isCalibrating = true;
        this.calibrationHits = [];
        this.calibrationExpectedTime = 0;
    }
    
    expectCalibrationHit(expectedTimestampDOM) {
        this.calibrationExpectedTime = expectedTimestampDOM;
    }

    handleCalibrationHit(hitTimestampDOM) {
        if (!this.calibrationExpectedTime) return;
        
        const offsetMs = hitTimestampDOM - this.calibrationExpectedTime;
        this.calibrationHits.push(offsetMs);
        this.calibrationExpectedTime = 0; 
        
        let avg = 0;
        if (this.calibrationHits.length > 0) {
            avg = this.calibrationHits.reduce((a,b) => a + b, 0) / this.calibrationHits.length;
        }

        const remaining = 8 - this.calibrationHits.length;
        if (this.onCalibrationHit) {
            this.onCalibrationHit(offsetMs, avg, remaining);
        }

        if (remaining <= 0) {
            this.latencySys = avg;
            this.isCalibrating = false;
        }
    }
}
