export class Metronome {
    constructor() {
        this.audioContext = null;
        this.isPlaying = false;
        
        // General Settings
        this.bpm = 120;
        this.lookahead = 25.0; // ms
        this.scheduleAheadTime = 0.1; // sec

        // Advanced Settings
        this.intervalMode = 'endless'; // endless, 1min, 3min
        this.countInBars = 2; // 0, 1, 2
        this.voicing = 'beep'; // beep, woodblock, voice
        this.emphasis = 'on-beat'; // on-beat, ands, 2and4
        
        this.gapRadioMode = 'off'; // off, constant, random-beat, random-bar
        this.gapConstantOn = 1;
        this.gapConstantOff = 1;
        this.gapChaos = 50;
        
        this.shakyEnabled = false;
        this.shakyRange = 10;
        this.shakyChance = 50;

        // Buffers
        this.voiceBuffers = {}; 
        this.loadVoiceSamples();

        // State trackers
        this.current16thNote = 0; 
        this.currentBarTotal = 0; 
        this.nextNoteTime = 0.0;
        this.timerWorker = null;
        this.sessionStartTime = null; 
        
        this.gapRadioActive = false; 
        this.gapBarCounter = 0;
        this.gapRandomBarOn = 0;
        this.gapRandomBarOff = 0;
        
        this.onIntervalComplete = null; 
    }

    async loadVoiceSamples() {
        const files = ['1.wav', '2.wav', '3.wav', '4.wav'];
        for (let i = 0; i < files.length; i++) {
            /* 
            // Stubbed for future asset delivery 
            try {
                const response = await fetch(`assets/sounds/${files[i]}`);
                const arrayBuffer = await response.arrayBuffer();
                if (this.audioContext) {
                    this.voiceBuffers[i] = await this.audioContext.decodeAudioData(arrayBuffer);
                }
            } catch (e) {
                console.warn(`Could not load voice sample ${files[i]}`);
            }
            */
        }
    }

    updateSettings(settings) {
        Object.assign(this, settings);
    }

    startStop() {
        if (this.isPlaying) {
            this.isPlaying = false;
            window.clearTimeout(this.timerWorker);
        } else {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            
            this.isPlaying = true;
            this.current16thNote = 0;
            this.currentBarTotal = 0;
            this.sessionStartTime = null;
            
            this.gapRadioActive = false;
            this.gapBarCounter = 0;
            if (this.gapRadioMode === 'random-bar') this.rollRandomBars();

            this.nextNoteTime = this.audioContext.currentTime + 0.05;
            this.scheduler();
        }
    }

    setBpm(newBpm) {
        if (!isNaN(newBpm) && newBpm >= 40 && newBpm <= 300) {
            this.bpm = newBpm;
        }
    }

    rollRandomBars() {
        this.gapRandomBarOn = Math.floor(Math.random() * 4) + 1; // 1-4
        this.gapRandomBarOff = Math.floor(Math.random() * 2) + 1; // 1-2
    }

    nextNote() {
        const secondsPerBeat = 60.0 / this.bpm;
        this.nextNoteTime += 0.25 * secondsPerBeat; 

        this.current16thNote++; 
        if (this.current16thNote === 16) {
            this.current16thNote = 0;
            this.currentBarTotal++;
            this.handleGapBarTransitions();
        }
    }
    
    handleGapBarTransitions() {
        const isCountIn = this.currentBarTotal < this.countInBars;
        if (isCountIn) return;

        if (this.gapRadioMode === 'constant') {
            this.gapBarCounter++;
            if (!this.gapRadioActive && this.gapBarCounter >= this.gapConstantOn) {
                this.gapRadioActive = true;
                this.gapBarCounter = 0;
            } else if (this.gapRadioActive && this.gapBarCounter >= this.gapConstantOff) {
                this.gapRadioActive = false;
                this.gapBarCounter = 0;
            }
        } 
        else if (this.gapRadioMode === 'random-bar') {
            this.gapBarCounter++;
            if (!this.gapRadioActive && this.gapBarCounter >= this.gapRandomBarOn) {
                this.gapRadioActive = true;
                this.gapBarCounter = 0;
            } else if (this.gapRadioActive && this.gapBarCounter >= this.gapRandomBarOff) {
                this.gapRadioActive = false;
                this.gapBarCounter = 0;
                this.rollRandomBars();
            }
        }
    }

    checkIntervalCompletion() {
        if (!this.sessionStartTime) return false;
        
        let targetLength = 0;
        if (this.intervalMode === '1min') targetLength = 60;
        else if (this.intervalMode === '3min') targetLength = 180;
        
        if (targetLength > 0 && this.audioContext.currentTime - this.sessionStartTime >= targetLength) {
            return true;
        }
        return false;
    }

    shouldPlayEmphasis(note16th) {
        if (this.emphasis === 'on-beat') {
            return note16th % 4 === 0;
        } else if (this.emphasis === 'ands') {
            return note16th % 4 === 2; // 16th resolution points at offbeat 8ths
        } else if (this.emphasis === '2and4') {
            return note16th === 4 || note16th === 12; 
        }
        return false;
    }

    scheduleNote(beatNumber16th, time) {
        const isCountInPhase = this.currentBarTotal < this.countInBars;

        // Kick off tracking timing explicitly when entering interval
        if (this.current16thNote === 0 && this.currentBarTotal === this.countInBars && !this.sessionStartTime) {
            this.sessionStartTime = time;
        }

        if (isCountInPhase) {
            if (beatNumber16th % 4 !== 0) return;
        } else {
            if (!this.shouldPlayEmphasis(beatNumber16th)) return;
        }

        const isDownbeat = (beatNumber16th === 0);
        const beatIndex = Math.floor(beatNumber16th / 4); 

        let scheduledTime = time;
        let gainValue = 1.0;

        // 1. Shaky Jitter
        if (!isCountInPhase && this.shakyEnabled) {
            if (Math.random() * 100 <= this.shakyChance) {
                const jitterMs = (Math.random() * this.shakyRange * 2) - this.shakyRange;
                scheduledTime += (jitterMs / 1000.0);
            }
        }

        // 2. Gap Muting
        if (!isCountInPhase) {
            if (this.gapRadioMode === 'constant' || this.gapRadioMode === 'random-bar') {
                if (this.gapRadioActive) gainValue = 0.0;
            } else if (this.gapRadioMode === 'random-beat') {
                if (Math.random() * 100 <= this.gapChaos) {
                    gainValue = 0.0;
                }
            }
        }

        if (gainValue > 0.0) {
            this.playVoice(isDownbeat, beatIndex, scheduledTime);
        }
    }

    playVoice(isDownbeat, beatIndex, time) {
        if (this.voicing === 'voice' && this.voiceBuffers[beatIndex]) { 
            const source = this.audioContext.createBufferSource();
            source.buffer = this.voiceBuffers[beatIndex];
            source.connect(this.audioContext.destination);
            source.start(time);
        } else if (this.voicing === 'woodblock') { 
            const osc = this.audioContext.createOscillator();
            const envelope = this.audioContext.createGain();
            const filter = this.audioContext.createBiquadFilter();

            osc.type = 'square';
            osc.frequency.value = isDownbeat ? 800 : 600;

            filter.type = 'bandpass';
            filter.frequency.value = 1000;
            filter.Q.value = 5;

            osc.connect(filter);
            filter.connect(envelope);
            envelope.connect(this.audioContext.destination);

            envelope.gain.setValueAtTime(0, time);
            envelope.gain.linearRampToValueAtTime(1, time + 0.005);
            envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.03);

            osc.start(time);
            osc.stop(time + 0.05);

        } else { // default beep
            const osc = this.audioContext.createOscillator();
            const envelope = this.audioContext.createGain();

            osc.connect(envelope);
            envelope.connect(this.audioContext.destination);

            osc.frequency.value = isDownbeat ? 1200.0 : 800.0; 

            envelope.gain.setValueAtTime(0, time);
            envelope.gain.linearRampToValueAtTime(1, time + 0.001);
            envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.02);

            osc.start(time);
            osc.stop(time + 0.03);
        }
    }

    scheduler() {
        if (this.checkIntervalCompletion()) {
            this.startStop(); 
            if (this.onIntervalComplete) this.onIntervalComplete();
            return;
        }

        while (this.nextNoteTime < this.audioContext.currentTime + this.scheduleAheadTime) {
            this.scheduleNote(this.current16thNote, this.nextNoteTime);
            this.nextNote();
        }
        
        if (this.isPlaying) {
            this.timerWorker = window.setTimeout(this.scheduler.bind(this), this.lookahead);
        }
    }
}
