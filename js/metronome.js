export class Metronome {
    constructor() {
        this.audioContext = null;
        this.isPlaying = false;
        
        // Settings
        this.bpm = 120;
        this.lookahead = 25.0; // How frequently to call scheduling function (in milliseconds)
        this.scheduleAheadTime = 0.1; // How far ahead to schedule audio (sec)

        // State
        this.current16thNote = 0; // What note is currently last scheduled?
        this.nextNoteTime = 0.0; // when the next note is due.
        this.timerWorker = null; // The setTimeout reference
    }

    startStop() {
        if (this.isPlaying) {
            // Stop
            this.isPlaying = false;
            window.clearTimeout(this.timerWorker);
        } else {
            // Start
            if (!this.audioContext) {
                // Initialize audio context upon first user gesture
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            this.isPlaying = true;
            this.current16thNote = 0;
            this.nextNoteTime = this.audioContext.currentTime + 0.05;
            this.scheduler();
        }
    }

    setBpm(newBpm) {
        if (!isNaN(newBpm) && newBpm > 0) {
            this.bpm = newBpm;
        }
    }

    nextNote() {
        // Advance current note and time by a 16th note
        const secondsPerBeat = 60.0 / this.bpm;
        this.nextNoteTime += 0.25 * secondsPerBeat; // Add beat length to last beat time

        this.current16thNote++; // Advance the beat number, wrap to zero
        if (this.current16thNote === 16) {
            this.current16thNote = 0;
        }
    }

    scheduleNote(beatNumber, time) {
        // Only play on quarter notes for now (0, 4, 8, 12)
        if (beatNumber % 4 === 0) {
            const osc = this.audioContext.createOscillator();
            const envelope = this.audioContext.createGain();

            osc.connect(envelope);
            envelope.connect(this.audioContext.destination);

            // Emphasize the first beat of the bar
            if (beatNumber === 0) {
                osc.frequency.value = 1200.0; // Higher, lighter click
            } else {
                osc.frequency.value = 800.0;
            }

            envelope.gain.value = 1;
            envelope.gain.exponentialRampToValueAtTime(1, time + 0.001);
            envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.02);

            osc.start(time);
            osc.stop(time + 0.03);
        }
    }

    scheduler() {
        // while there are notes that will need to play before the next interval,
        // schedule them and advance the pointer.
        while (this.nextNoteTime < this.audioContext.currentTime + this.scheduleAheadTime) {
            this.scheduleNote(this.current16thNote, this.nextNoteTime);
            this.nextNote();
        }
        
        if (this.isPlaying) {
            this.timerWorker = window.setTimeout(this.scheduler.bind(this), this.lookahead);
        }
    }
}
