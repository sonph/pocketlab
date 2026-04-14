import { Metronome } from '../js/metronome.js';
import { runMidiTests } from './midi.test.js';

const output = document.getElementById('test-output');
const progress = document.getElementById('test-progress');
let passed = 0;
let total = 0;

function assertClose(actual, expected, tolerance, name) {
    total++;
    const diff = Math.abs(actual - expected);
    if (diff <= tolerance) {
        if (output) output.innerHTML += `✅ <span style="color: #4ade80;">[PASS]</span> ${name} (Got: ${actual.toFixed(2)})\n`;
        passed++;
    } else {
        if (output) output.innerHTML += `❌ <span style="color: #f87171;">[FAIL]</span> ${name} | Expected: ${expected.toFixed(2)}, Got: ${actual.toFixed(2)}\n`;
    }
}

function assertEqual(actual, expected, name) {
    total++;
    if (actual === expected) {
        if (output) output.innerHTML += `✅ <span style="color: #4ade80;">[PASS]</span> ${name} (Got: ${actual})\n`;
        passed++;
    } else {
        if (output) output.innerHTML += `❌ <span style="color: #f87171;">[FAIL]</span> ${name} | Expected: ${expected}, Got: ${actual}\n`;
    }
}

export function runMetronomeTests() {
    if (!output) return;
    
    output.innerHTML += `\nRunning metronome.js tests...\n--------------------------\n`;
    
    try {
        const metronome = new Metronome();
        
        // 1. Basic properties defaults
        assertEqual(metronome.bpm, 120, 'Metronome defaults strictly to 120 BPM');
        assertEqual(metronome.bpmPulse, 4, 'Metronome defaults to Quarter Note Pulse (4)');
        
        // 2. Pulse: Quarter Note verification
        metronome.updateSettings({ bpm: 120, bpmPulse: 4 });
        assertEqual(metronome.getEffectiveQuarterBpm(), 120, '120 BPM Quarter Pulse correctly parses to 120 Effective BPM');
        
        // 3. Pulse: Eighth Note verification
        metronome.updateSettings({ bpm: 120, bpmPulse: 8 });
        assertEqual(metronome.getEffectiveQuarterBpm(), 60, '120 BPM Eighth Pulse effectively splits speed exactly 50% (60 Effective BPM quarter equivalence)');
        
        // 4. Pulse constraint and extreme math bound check
        metronome.updateSettings({ bpm: 240, bpmPulse: 8 });
        assertEqual(metronome.getEffectiveQuarterBpm(), 120, '240 Eighth pulse bounds accurately to 120 Effective BPM Quarter Math');
        
        // 5. Test ticks and quarters behavior logic interaction
        metronome.updateSettings({ tsCount: 7, tsSubdiv: 8 });
        const quartersPerBar = metronome.tsCount * (4.0 / metronome.tsSubdiv);
        assertClose(quartersPerBar, 3.5, 0.001, 'Quarter Note density evaluated correctly for complex 7/8 subdivs');

        // 6. Test Backbeats vs Main Beat Pattern logic
        let scheduledVoices = [];
        metronome.playVoice = function(isDownbeat, beatIndex, time, volume) {
            scheduledVoices.push({ beatIndex, volume });
        };
        metronome.playSubdivisionVoice = function() {};
        
        // Ensure countIn is off to evaluate raw patterns
        metronome.currentBarTotal = 2;
        metronome.countInBars = 0;
        
        // Test Both checked
        metronome.patterns['main'] = true;
        metronome.patterns['backbeats'] = true;
        metronome.patternVolumes['main'] = 1.0;
        metronome.patternVolumes['backbeats'] = 0.8;
        
        scheduledVoices = [];
        metronome.scheduleNote(0, 0); // beat 1 (index 0) - main beat
        metronome.scheduleNote(12, 0); // beat 2 (index 1) - backbeat
        metronome.scheduleNote(24, 0); // beat 3 (index 2) - main beat
        metronome.scheduleNote(36, 0); // beat 4 (index 3) - backbeat
        
        assertEqual(scheduledVoices.length, 4, 'All 4 beats scheduled when both main and backbeats are true');
        assertEqual(scheduledVoices[0].volume, 1.0, 'Beat 1 uses main volume');
        assertEqual(scheduledVoices[1].volume, 0.8, 'Beat 2 uses backbeat volume');
        assertEqual(scheduledVoices[2].volume, 1.0, 'Beat 3 uses main volume');
        assertEqual(scheduledVoices[3].volume, 0.8, 'Beat 4 uses backbeat volume');
        
        // Test Only Backbeats
        metronome.patterns['main'] = false;
        metronome.patterns['backbeats'] = true;
        scheduledVoices = [];
        metronome.scheduleNote(0, 0); // beat 1
        metronome.scheduleNote(12, 0); // beat 2
        metronome.scheduleNote(24, 0); // beat 3
        metronome.scheduleNote(36, 0); // beat 4
        
        assertEqual(scheduledVoices.length, 2, 'Only 2 beats scheduled when main is false and backbeats is true');
        if (scheduledVoices.length === 2) {
            assertEqual(scheduledVoices[0].beatIndex, 1, 'First scheduled beat is beat 2 (index 1)');
            assertEqual(scheduledVoices[1].beatIndex, 3, 'Second scheduled beat is beat 4 (index 3)');
        }
        
        // Test Only Main
        metronome.patterns['main'] = true;
        metronome.patterns['backbeats'] = false;
        scheduledVoices = [];
        metronome.scheduleNote(0, 0); // beat 1
        metronome.scheduleNote(12, 0); // beat 2
        metronome.scheduleNote(24, 0); // beat 3
        metronome.scheduleNote(36, 0); // beat 4
        
        assertEqual(scheduledVoices.length, 2, 'Only 2 beats scheduled when main is true and backbeats is false');
        if (scheduledVoices.length === 2) {
            assertEqual(scheduledVoices[0].beatIndex, 0, 'First scheduled beat is beat 1 (index 0)');
            assertEqual(scheduledVoices[1].beatIndex, 2, 'Second scheduled beat is beat 3 (index 2)');
        }

    } catch (e) {
        output.innerHTML += `\n💥 ERROR during Metronome execution: ${e.message}\n${e.stack}\n`;
    }
    
    output.innerHTML += `\n--------------------------\n`;
    progress.innerHTML = `Tests Completed: ${passed}/${total} passed.`;
    if (passed === total) {
        progress.style.color = '#a3e635';
    } else {
        progress.style.color = '#f87171';
    }
    
    runMidiTests();
}
