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
        
        this.tsCount = 4;
        this.tsSubdiv = 4;
        this.masterVolume = 1.0;
        
        this.patterns = {
            'main': true,
            '8th': false,
            '8thTrip': false,
            '16th': false,
            '16thTrip': false
        };
        this.patternVolumes = {
            'main': 1.0,
            '8th': 0.5,
            '8thTrip': 0.5,
            '16th': 0.5,
            '16thTrip': 0.5
        };
        this.masterGainNode = null;
        
        this.gapRadioMode = 'off'; // off, constant, random-beat, random-bar
        this.gapConstantOn = 1;
        this.gapConstantOff = 1;
        this.gapChaos = 50;
        this.feedbackVolume = 1.0;
        
        this.shakyEnabled = false;
        this.shakyRange = 10;
        this.shakyChance = 50;

        // Buffers
        this.voiceBuffers = {}; 
        this.voiceLoaded = false;
        
        this.feedbackBuffers = {};
        this.feedbackLoaded = false;

        // State trackers
        this.currentTick = 0; // Out of (tsCount * 12)
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
        if (this.voiceLoaded || !this.audioContext) return;
        this.voiceLoaded = true;

        const voices = ['female', 'male'];
        const beats = ['one', 'two', 'three', 'four'];

        for (let voice of voices) {
            this.voiceBuffers[voice] = {};
            for (let i = 0; i < beats.length; i++) {
                try {
                    const response = await fetch(`assets/sounds/metronome/${voice} ${beats[i]}.wav`);
                    const arrayBuffer = await response.arrayBuffer();
                    this.voiceBuffers[voice][i] = await this.audioContext.decodeAudioData(arrayBuffer);
                } catch (e) {
                    console.warn(`Could not load voice sample ${voice} ${beats[i]}.wav`, e);
                }
            }
        }
    }

    async loadFeedbackSamples() {
        if (this.feedbackLoaded || !this.audioContext) return;
        this.feedbackLoaded = true;
        const files = ['good', 'great', 'perfect', 'toofast', 'tooslow'];
        for (const f of files) {
            try {
                const response = await fetch(`assets/sounds/feedback/${f}.wav`);
                const arrayBuffer = await response.arrayBuffer();
                this.feedbackBuffers[f] = await this.audioContext.decodeAudioData(arrayBuffer);
            } catch (e) {
                console.warn(`Could not load feedback sample ${f}.wav`, e);
            }
        }
    }

    playFeedback(type, volume = 1.0) {
        if (!this.feedbackBuffers[type] || volume <= 0.0) return;
        const source = this.audioContext.createBufferSource();
        const envelope = this.audioContext.createGain();
        source.buffer = this.feedbackBuffers[type];
        source.connect(envelope);
        envelope.connect(this.masterGainNode);
        envelope.gain.value = volume * this.feedbackVolume;
        source.start(0);
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
                this.loadVoiceSamples();
                this.loadFeedbackSamples();
            }
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            
            if (!this.masterGainNode) {
                this.masterGainNode = this.audioContext.createGain();
                this.masterGainNode.connect(this.audioContext.destination);
            }
            this.masterGainNode.gain.value = this.masterVolume;
            
            this.isPlaying = true;
            this.currentTick = 0;
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
        // 12 internal micro-ticks per beat
        this.nextNoteTime += (1.0 / 12.0) * secondsPerBeat; 

        // Ticks cycle up to limit dictated by Time Signature count
        const ticksPerBar = this.tsCount * 12;

        this.currentTick++; 
        if (this.currentTick >= ticksPerBar) {
            this.currentTick = 0;
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

    shouldPlayEmphasis(tick) {
        if (this.emphasis === 'on-beat') {
            return tick % 12 === 0;
        } else if (this.emphasis === 'ands') {
            return tick % 12 === 6; // exact middle of the beat
        } else if (this.emphasis === '2and4') {
            const beatNumber = Math.floor(tick / 12);
            return (beatNumber === 1 || beatNumber === 3) && (tick % 12 === 0); 
        }
        return false;
    }

    scheduleNote(tick, time) {
        const isCountInPhase = this.currentBarTotal < this.countInBars;

        // Kick off tracking timing explicitly when entering interval
        if (this.currentTick === 0 && this.currentBarTotal === this.countInBars && !this.sessionStartTime) {
            this.sessionStartTime = time;
        }

        // Determine specific layering triggers to allow active poly-rhythmic rendering
        let playMainBeat = false;
        if (isCountInPhase) {
            playMainBeat = (tick % 12 === 0);
        } else {
            playMainBeat = this.shouldPlayEmphasis(tick);
        }
        
        let subVoiceVol = 0.0;
        if (tick % 12 !== 0 && !isCountInPhase) {
            // Tick 6 (8th note) aligns with 8th, 16th, and 16thTrip grids
            if (tick % 6 === 0) {
                if (this.patterns['8th']) subVoiceVol = Math.max(subVoiceVol, this.patternVolumes['8th']);
                if (this.patterns['16th']) subVoiceVol = Math.max(subVoiceVol, this.patternVolumes['16th']);
                if (this.patterns['16thTrip']) subVoiceVol = Math.max(subVoiceVol, this.patternVolumes['16thTrip']);
            }
            // Ticks 4, 8 (8th Trip) align with 8thTrip and 16thTrip
            else if (tick % 4 === 0) {
                if (this.patterns['8thTrip']) subVoiceVol = Math.max(subVoiceVol, this.patternVolumes['8thTrip']);
                if (this.patterns['16thTrip']) subVoiceVol = Math.max(subVoiceVol, this.patternVolumes['16thTrip']);
            }
            // Ticks 3, 9 (16th Note) align cleanly
            else if (tick % 3 === 0) {
                if (this.patterns['16th']) subVoiceVol = Math.max(subVoiceVol, this.patternVolumes['16th']);
            }
            // Ticks 2, 10 (16th Trip) align cleanly
            else if (tick % 2 === 0) {
                if (this.patterns['16thTrip']) subVoiceVol = Math.max(subVoiceVol, this.patternVolumes['16thTrip']);
            }
        }

        if (!playMainBeat && subVoiceVol <= 0.0) {
            return;
        }

        const isDownbeat = (tick === 0);
        const beatIndex = Math.floor(tick / 12); 

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
            // Trigger specific rendering paths
            if (playMainBeat || isCountInPhase) {
                if (this.patterns['main'] || isCountInPhase) {
                    this.playVoice(isDownbeat, beatIndex, scheduledTime, this.patternVolumes['main']);
                }
            }
            if (!isCountInPhase && subVoiceVol > 0.0) {
                this.playSubdivisionVoice(scheduledTime, subVoiceVol);
            }
        }

        // Always alert engine mapping logic even if muted (Gap Radio), and include subdivisions
        if (this.onNoteScheduled && (playMainBeat || isCountInPhase || (!isCountInPhase && subVoiceVol > 0.0))) {
            this.onNoteScheduled({ time: scheduledTime, isDownbeat, beatIndex });
        }
    }

    playVoice(isDownbeat, beatIndex, time, volume = 1.0) {
        if (volume <= 0.0) return;
        
        if (this.voicing === 'female-voice' || this.voicing === 'male-voice') { 
            const voiceType = this.voicing.split('-')[0]; // 'female' or 'male'
            const bufIndex = beatIndex % 4; // Cycles through one, two, three, four
            
            if (this.voiceBuffers[voiceType] && this.voiceBuffers[voiceType][bufIndex]) {
                const source = this.audioContext.createBufferSource();
                const envelope = this.audioContext.createGain();
                source.buffer = this.voiceBuffers[voiceType][bufIndex];
            
                source.connect(envelope);
                envelope.connect(this.masterGainNode);
                envelope.gain.value = volume;
                
                source.start(time);
            }
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
            envelope.connect(this.masterGainNode);

            envelope.gain.setValueAtTime(0, time);
            envelope.gain.linearRampToValueAtTime(volume, time + 0.005);
            envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.03);

            osc.start(time);
            osc.stop(time + 0.05);

        } else { // default beep
            const osc = this.audioContext.createOscillator();
            const envelope = this.audioContext.createGain();

            osc.connect(envelope);
            envelope.connect(this.masterGainNode);

            osc.frequency.value = isDownbeat ? 1200.0 : 800.0; 

            envelope.gain.setValueAtTime(0, time);
            envelope.gain.linearRampToValueAtTime(volume, time + 0.001);
            envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.02);

            osc.start(time);
            osc.stop(time + 0.03);
        }
    }

    playSubdivisionVoice(time, volume) {
        if (volume <= 0.0) return;
        const osc = this.audioContext.createOscillator();
        const envelope = this.audioContext.createGain();

        osc.connect(envelope);
        envelope.connect(this.masterGainNode);

        // Subdivisions get a cleaner, lighter tick
        osc.frequency.value = 1800.0; 
        osc.type = 'triangle';

        envelope.gain.setValueAtTime(0, time);
        // Soften it aggressively so it doesn't overshadow the money beat
        envelope.gain.linearRampToValueAtTime(volume * 0.3, time + 0.001); 
        envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.012);

        osc.start(time);
        osc.stop(time + 0.015);
    }

    scheduler() {
        if (this.checkIntervalCompletion()) {
            this.startStop(); 
            if (this.onIntervalComplete) this.onIntervalComplete();
            return;
        }

        while (this.nextNoteTime < this.audioContext.currentTime + this.scheduleAheadTime) {
            this.scheduleNote(this.currentTick, this.nextNoteTime);
            this.nextNote();
        }
        
        if (this.isPlaying) {
            this.timerWorker = window.setTimeout(this.scheduler.bind(this), this.lookahead);
        }
    }
}
